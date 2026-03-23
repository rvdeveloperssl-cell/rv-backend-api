const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const axios = require('axios'); // Nodemailer වෙනුවට Axios ගත්තා
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());



// MySQL Connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

// සරල පරීක්ෂණයක්
app.get('/', (req, res) => {
    res.send('RV Backend API Running via Google Script - 2026!');
});

// --- 1. පොදුවේ Email යවන Function එක (Node.js backend ඇතුළේ) ---
// මේක ඔයාගේ server.js එකේ ඉහළින්ම දාගන්න.
async function sendEmailViaScript(payload) {
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxDBtNzkGL685gbIA6foL6FyD-JE7usPQ32mtw1_QuM4KZo_GkZvsXSvA3pQzc41psHXA/exec';
    try {
        const response = await axios.post(GOOGLE_SCRIPT_URL, payload);
        // Google Script එක "Success" කියලා එවුවොත් true, නැත්නම් false
        return response.data === "Success";
    } catch (error) {
        console.error("❌ Email Script Error:", error.message);
        return false;
    }
}

// --- OTP යවන API එක (Google Script එකට Connect කළා) ---
app.post('/api/send-otp', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Missing email or otp' });
    }

    try {
        // අපි හදපු පොදු function එකට Payload එක යවනවා
        // මෙතන type එක 'otp' කියලා යැව්වම Google Script එකේ logic එකට ගැලපෙනවා
        const isSent = await sendEmailViaScript({
            type: 'otp',
            email: email,
            otp: otp
        });

        if (isSent) {
            res.status(200).json({ 
                success: true, 
                message: 'OTP sent successfully via Google Script!' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Google Script failed to send email.' 
            });
        }
    } catch (error) {
        console.error("❌ API Error:", error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error.' 
        });
    }
});

// File upload karanna Multer ona venawa
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Slip save කරන folder එක හදනවා
const uploadDir = 'uploads/slips';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// මෙතන නම slipStorage ලෙස වෙනස් කළා
const slipStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'slip-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// මෙතන නම uploadSlip ලෙස වෙනස් කළා
const uploadSlip = multer({ storage: slipStorage });

// Uploads ෆෝල්ඩර් එක static ලෙස පාවිච්චි කිරීම (මේක එක පාරක් තිබුණාම ඇති)
app.use('/uploads', express.static('uploads'));


// --- LICENSE GENERATOR FUNCTION ---
// මේක function එකක් විදිහට ගත්තා ඕනෑම තැනක පාවිච්චි කරන්න පුළුවන් වෙන්න
function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const part1 = Array(5).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
    const part2 = Array(5).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `RVQ-${part1}-${part2}`;
}

// --- UPDATED REGISTER API ---
app.post('/api/register', (req, res) => {
    const { fullName, email, phone, nic, address, companyName, password } = req.body;
    
    // ID එකක් හදනවා
    const userId = 'user_' + Date.now();
    const licenseId = 'lic_' + Date.now();
    
    // 1. අලුත් ලයිසන් කී එකක් හදනවා
    const finalKey = generateLicenseKey();

    // 2. වසරක Expiry Date එකක් හදනවා
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    const formattedExpiry = expiryDate.toISOString().slice(0, 19).replace('T', ' ');

    // --- SQL UPDATE: User table එකේ licenseKey column එකටත් data දානවා ---
    const userQuery = `INSERT INTO users 
        (id, fullName, email, phone, nic, address, companyName, password, role, licenseKey) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'client', ?)`;
    
    db.query(userQuery, [userId, fullName, email, phone, nic, address, companyName, password, finalKey], (err, result) => {
        if (err) {
            console.error("❌ SQL User Error:", err.message);
            return res.status(500).json({ success: false, message: err.message });
        }

        // 3. කලින් තිබ්බ විදිහටම licenses table එකෙත් record එක හදනවා (Logic එක ආරක්ෂා කර ගැනීමට)
        const licenseQuery = `INSERT INTO licenses 
            (id, softwareId, userId, licenseKey, status, createdAt, expiresAt, maxActivations, currentActivations) 
            VALUES (?, NULL, ?, ?, 'active', NOW(), ?, 1, 0)`;

        db.query(licenseQuery, [licenseId, userId, finalKey, formattedExpiry], async (licErr) => {
            if (licErr) {
                console.error("❌ SQL License Table Error:", licErr.message);
                // මෙතන error එකක් ආවත් user හැදිලා නිසා ලොකු අවුලක් වෙන්නේ නැහැ
            }

            // 4. Welcome Email එක යවනවා
            try {
                await sendEmailViaScript({
                    type: 'welcome',
                    email: email,
                    fullName: fullName,
                    licenseKey: finalKey 
                });
            } catch (emailErr) {
                console.error("❌ Welcome Email Failed:", emailErr);
            }

            // අවසාන ප්‍රතිචාරය
            res.json({ 
                success: true, 
                message: 'Registration successful! License key generated and saved.',
                licenseKey: finalKey 
            });
        });
    });
});

// Login API
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    // 1. මෙතනින් Terminal එකේ පෙන්වයි හරියටම Frontend එකෙන් එන Email එක මොකක්ද කියලා
    console.log("--- Login Attempt ---");
    console.log("Email received:", `"${email}"`); // Email එක වටේ "" දාලා තියෙන්නේ space තියෙනවද බලන්න ලේසි වෙන්නයි
    console.log("Password received:", `"${password}"`);

    // 2. Database එකේ හොයනවා (Spaces අයින් කරලා TRIM() කරලා බලමු)
    db.query('SELECT * FROM users WHERE TRIM(email) = TRIM(?)', [email], (err, results) => {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).json({ success: false, message: err.message });
        }
        
        if (results.length === 0) {
            console.log("Result: User not found in DB!");
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        const user = results[0];
        if (user.password === password) {
            console.log("Result: Login Successful!");
            res.json({ success: true, user: user });
        } else {
            console.log("Result: Invalid password!");
            res.status(401).json({ success: false, message: 'Invalid password' });
        }
    });
});

// --- SOFTWARE MANAGEMENT API (MySQL) ---

// 1. මේක තමයි Dashboard එකට ඕන කරන එක (වැදගත්ම එක)
app.get('/api/software/all', (req, res) => {
    // JOIN එකක් පාවිච්චි කරලා reviews table එකෙන් ratings ටික මෙතනටම ගත්තා
    const query = `
        SELECT 
            s.*, 
            COUNT(r.id) AS reviewCount, 
            IFNULL(AVG(r.rating), 0) AS averageRating 
        FROM software s
        LEFT JOIN reviews r ON s.id = r.softwareId
        GROUP BY s.id
        ORDER BY s.name ASC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("❌ Software fetch error:", err);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json(results);
    });
});

// 2. සාමාන්‍යයෙන් ඔක්කොම සොෆ්ට්වෙයාර් ගන්න එක (Admin එකට වගේ)
app.get('/api/software', (req, res) => {
    db.query('SELECT * FROM software ORDER BY createdAt DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 3. එක සොෆ්ට්වෙයාර් එකක් ID එකෙන් ගැනීම
app.get('/api/software/:id', (req, res) => {
    const { id } = req.params;

    // අලුත් structure එකට අනුව SELECT query එක (s.* මගින් සියලුම අලුත් columns ලැබේ)
    const query = `
        SELECT 
            s.*, 
            COUNT(r.id) AS reviewCount, 
            IFNULL(AVG(r.rating), 0) AS averageRating 
        FROM software s
        LEFT JOIN reviews r ON s.id = r.softwareId
        WHERE s.id = ?
        GROUP BY s.id
    `;

    db.query(query, [id], (err, results) => {
        if (err) {
            console.error("Database Error:", err.message);
            return res.status(500).json({ 
                success: false, 
                error: "Internal Server Error" 
            });
        }

        if (results.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "Software not found" 
            });
        }

        // සාර්ථකව දත්ත ලැබුණාම response එක යවනවා
        res.json(results[0]);
    });
});

// 4. Add New Software (අලුත් Table Structure එකට අනුව)
app.post('/api/software', (req, res) => {
    const { 
        name, productSlug, description, price, version, category, 
        imageUrl, systemRequirements, isFree, isActive, features, productLinks 
    } = req.body;

    // Database එකේ අලුත් columns (productSlug, productLinks) ඇතුළත් SQL Query එක
    const query = `INSERT INTO software 
    (name, productSlug, description, price, version, category, imageUrl, systemRequirements, isFree, isActive, features, productLinks) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    // Array විදිහට එන දත්ත JSON string බවට පත් කිරීම
    const featuresData = Array.isArray(features) ? JSON.stringify(features) : features;
    const productLinksData = Array.isArray(productLinks) || typeof productLinks === 'object' 
                             ? JSON.stringify(productLinks) : productLinks;

    db.query(query, [
        name, 
        productSlug, 
        description, 
        price, 
        version, 
        category, 
        imageUrl, 
        systemRequirements, 
        isFree ? 1 : 0, 
        isActive ? 1 : 0, 
        featuresData, 
        productLinksData
    ], (err, result) => {
        if (err) {
            console.error("❌ SQL Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, id: result.insertId });
    });
});

// 5. Update Software
app.put('/api/software/:id', (req, res) => {
    const { id } = req.params;
    const { 
        name, productSlug, description, price, version, category, 
        imageUrl, systemRequirements, isFree, isActive, features, productLinks 
    } = req.body;

    // Update query එකත් අලුත් columns වලට ගැලපෙන සේ වෙනස් කරන ලදී
    const query = `UPDATE software SET 
    name=?, productSlug=?, description=?, price=?, version=?, category=?, 
    imageUrl=?, systemRequirements=?, isFree=?, isActive=?, features=?, productLinks=? 
    WHERE id=?`;

    const featuresData = Array.isArray(features) ? JSON.stringify(features) : features;
    const productLinksData = Array.isArray(productLinks) || typeof productLinks === 'object' 
                             ? JSON.stringify(productLinks) : productLinks;

    db.query(query, [
        name, 
        productSlug, 
        description, 
        price, 
        version, 
        category, 
        imageUrl, 
        systemRequirements, 
        isFree ? 1 : 0, 
        isActive ? 1 : 0, 
        featuresData, 
        productLinksData, 
        id
    ], (err, result) => {
        if (err) {
            console.error("❌ SQL Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// 6. Delete Software
app.delete('/api/software/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM software WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});



// --- RV DEVELOPERS PAYMENT SYSTEM (FIXED FOR IMGBB & FULL NAME) ---

// 1. Bank Slip URL එක සහ Purchase එකක් create කිරීම
// මෙතන දැන් upload.single('slip') අවශ්‍ය නැත, මොකද එන්නේ string URL එකක් නිසා
app.post('/api/payments/bank-transfer', (req, res) => {
    // 1. Frontend එකෙන් එවන දත්ත ලබා ගැනීම
    const { userId, softwareId, slipUrl } = req.body; 
    
    console.log("--- New Payment Submission ---");
    console.log("Received Data:", req.body);

    // 2. දත්ත null ද කියා පරීක්ෂා කිරීම (Safety Check)
    if (!userId || !softwareId || !slipUrl) {
        console.error("❌ Error: Missing required fields");
        return res.status(400).json({ success: false, message: 'Missing required data' });
    }

    // 3. IDs සෑදීම
    const timestamp = Date.now();
    const purchaseId = 'pur_' + timestamp;
    // පෙන්වීමට පමණක් ලස්සන Invoice අංකයක් (Prefix එකක් සමඟ)
    const invoiceNo = `INV-${timestamp.toString().slice(-8)}`; 

    // 4. User ගේ fullName, Software එකේ price සහ LICENSE ID එක ලබා ගැනීම
    // මෙතන JOIN එකක් දාලා licenseId එකත් ගන්නවා
    const dataQuery = `
        SELECT u.fullName, s.price, l.id as licenseId
        FROM users u
        JOIN software s ON s.id = ?
        LEFT JOIN licenses l ON l.userId = u.id
        WHERE u.id = ?`;

    db.query(dataQuery, [softwareId, userId], (err, results) => {
        if (err || results.length === 0) {
            console.error("❌ DB Error or No results:", err);
            return res.status(500).json({ success: false, message: 'User or Software not found' });
        }

        const fullName = results[0].fullName;
        const amount = results[0].price;
        const licenseIdFromDB = results[0].licenseId; // මෙන්න මෙතනට licenseId එක එනවා

        // 5. Purchases table එකට දත්ත ඇතුළත් කිරීම
        // මෙහිදී ඔයා ඉල්ලපු විදිහට licenseId එකත් query එකට එකතු කළා
        const query = `INSERT INTO purchases 
    (id, userId, fullName, softwareId, amount, paymentMethod, paymentStatus, slipUrl, createdAt, invoiceId, licenseId) 
    VALUES (?, ?, ?, ?, ?, 'bank_transfer', 'pending', ?, NOW(), ?, ?)`;

        db.query(query, [purchaseId, userId, fullName, softwareId, amount, slipUrl, invoiceNo, licenseIdFromDB], (err, result) => {
            if (err) {
                console.error("❌ Insert Error:", err);
                return res.status(500).json({ success: false, message: err.message });
            }

            console.log("✅ Success: Payment record created with ID:", purchaseId);
            
            // සාර්ථක ප්‍රතිචාරය සමඟ invoiceNo එකත් යවනවා
            res.json({ 
                success: true, 
                message: 'Slip submitted successfully!', 
                purchaseId: purchaseId,
                invoiceNo: invoiceNo 
            });
        });
    });
});

// 2. Admin ට පෙන්වන්න සියලුම පූජාවන් (Unknown ප්‍රශ්නය මෙතනින් සම්පූර්ණයෙන්ම ඉවරයි)
app.get('/api/admin/purchases/all', (req, res) => {
    // මෙතනදී අපි පරණ records වල fullName නැති වුණොත් 'Unknown' පෙන්වන විදිහට හදමු
    const query = `
        SELECT p.*, s.name as softwareName 
        FROM purchases p 
        LEFT JOIN software s ON p.softwareId = s.id 
        ORDER BY p.createdAt DESC`;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error("Fetch Error:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// 3. Admin payment එක verify කිරීම
app.post('/api/admin/verify-payment/:purchaseId', (req, res) => {
    const { purchaseId } = req.params;
    const { adminId } = req.body;

    // 1. කලින්ට වඩා වැඩිපුර දත්ත ප්‍රමාණයක් (softwareId, licenseId) මෙතනින් ගන්නවා
    const getPurchaseDetails = `
        SELECT p.userId, p.softwareId, p.licenseId, u.email, u.fullName, 
               s.name as softwareName, s.productSlug as softwareSlug, 
               l.licenseKey, l.allowed_apps
        FROM purchases p 
        JOIN users u ON p.userId = u.id 
        JOIN software s ON p.softwareId = s.id 
        LEFT JOIN licenses l ON p.userId = l.userId
        WHERE p.id = ?`;

    db.query(getPurchaseDetails, [purchaseId], (err, rows) => {
        if (err || rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase not found' });
        }

        const { userId, softwareId, email, fullName, softwareName, softwareSlug, licenseKey, allowed_apps } = rows[0];

        // 2. Allowed Apps update logic
        let apps = [];
        try {
            apps = JSON.parse(allowed_apps || "[]");
        } catch (e) {
            apps = [];
        }
        if (!apps.includes(softwareSlug)) {
            apps.push(softwareSlug);
        }

        // 3. TRANSACTION එකක් විදිහට මේ Updates දෙකම කරනවා නම් වඩාත් ආරක්ෂිතයි
        // නමුත් දැනට සරලව SQL Queries දෙක දාන්නම්:

        // Purchase Status එක 'verified' කරනවා
        const updatePurchase = `UPDATE purchases SET paymentStatus = 'verified', verifiedAt = NOW(), verifiedBy = ? WHERE id = ?`;

        db.query(updatePurchase, [adminId, purchaseId], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Purchase update failed' });

            // 4. වැදගත්ම තැන: Licenses Table එකේ softwareId එකත් මෙතනදි Update කරනවා (NULL වෙන්නේ නැති වෙන්න)
            const updateLicense = `
                UPDATE licenses 
                SET allowed_apps = ?, 
                    softwareId = ?, 
                    status = 'active' 
                WHERE userId = ?`;

            db.query(updateLicense, [JSON.stringify(apps), softwareId, userId], async (licErr) => {
                if (licErr) {
                    console.error("❌ License Sync Error:", licErr.message);
                }

                // 5. Email එක යැවීම
                try {
                    await sendEmailViaScript({
                        type: 'purchase_verified',
                        email: email,
                        fullName: fullName,
                        softwareName: softwareName,
                        licenseKey: licenseKey 
                    });
                } catch (emailErr) {
                    console.error("❌ Email Sending Failed:", emailErr);
                }

                res.json({ 
                    success: true, 
                    message: 'Payment verified and License linked successfully!',
                    userLicenseKey: licenseKey 
                });
            });
        });
    });
});

// 4. Admin payment එක reject කිරීම
app.post('/api/admin/reject-payment/:id', (req, res) => {
    const { id } = req.params;
    const { adminId } = req.body;
    
    const query = `UPDATE purchases SET paymentStatus = 'rejected', verifiedAt = NOW(), verifiedBy = ? WHERE id = ?`;

    db.query(query, [adminId, id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: 'Payment rejected!' });
    });
});

// 5. User ගේ purchases තමන්ට බලාගන්න
app.get('/api/purchases/user/:userId', (req, res) => {
    const { userId } = req.params;
    db.query('SELECT p.*, s.name as softwareName FROM purchases p JOIN software s ON p.softwareId = s.id WHERE p.userId = ?', [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 6. Admin ට Pending payments විතරක් පෙන්වන්න (Stats වලට සහ Filter වලට)
app.get('/api/admin/payments/pending', (req, res) => {
    // මෙතන LEFT JOIN පාවිච්චි කරලා තියෙන්නේ, මොකද යම් හෙයකින් 
    // user කෙනෙක් delete වුණත් slip එක admin ට පේන්න ඕනේ නිසා.
    const query = `
        SELECT p.*, u.fullName, s.name as softwareName 
        FROM purchases p 
        LEFT JOIN users u ON p.userId = u.id 
        LEFT JOIN software s ON p.softwareId = s.id 
        WHERE p.paymentStatus = 'pending'
        ORDER BY p.createdAt DESC`;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Pending fetch error: ", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// 1. සියලුම Licenses ලබා ගැනීම (Admin සඳහා)
app.get('/api/admin/licenses/all', (req, res) => {
    // මෙහිදී licenses table එක සහ users table එක JOIN කරfullName එක ලබා ගනී
    const query = `
        SELECT l.*, u.fullName 
        FROM licenses l
        LEFT JOIN users u ON l.userId = u.id
        ORDER BY l.createdAt DESC`;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).json({ success: false, message: err.message });
        }
        // දත්ත සාර්ථකව ලැබුණොත් ඒවා යවන්න
        res.json(results);
    });
});

// 2. Expiry Date එක යාවත්කාලීන කිරීම
app.put('/api/admin/licenses/:id/expiry', (req, res) => {
    const { id } = req.params;
    const { expiresAt } = req.body; // මෙය "YYYY-MM-DD HH:MM:SS" ආකෘතියෙන් ලැබිය යුතුයි

    if (!expiresAt) {
        return res.status(400).json({ success: false, message: 'Expiry date is required' });
    }

    const query = `UPDATE licenses SET expiresAt = ? WHERE id = ?`;

    db.query(query, [expiresAt, id], (err, result) => {
        if (err) {
            console.error("Update Expiry Error:", err);
            return res.status(500).json({ success: false, error: err.message });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'License not found' });
        }

        res.json({ success: true, message: 'License expiry updated successfully!' });
    });
});

// 3. License එකක් Block/Unblock කිරීම
app.put('/api/admin/licenses/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'active' හෝ 'blocked'

    const query = `UPDATE licenses SET status = ? WHERE id = ?`;

    db.query(query, [status, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: `License status changed to ${status}` });
    });
});

// පද්ධතියේ අලුත්ම ක්‍රියාකාරකම් (Recent Activity) ලබා ගැනීම
app.get('/api/admin/activities/recent', (req, res) => {
    // මෙතනදී 'purchases' ටේබල් එකෙන් අලුත්ම දත්ත හෝ 
    // වෙනම activity_logs ටේබල් එකක් තියෙනවා නම් ඒක පාවිච්චි කරන්න පුළුවන්.
    // දැනට අපි purchases සහ licenses වල සිදුවීම් පෙන්වමු.
    const query = `
        (SELECT 'Purchase' as type, CONCAT('New purchase of LKR ', amount) as details, createdAt 
         FROM purchases)
        UNION
        (SELECT 'License' as type, CONCAT('License generated: ', licenseKey) as details, createdAt 
         FROM licenses)
        ORDER BY createdAt DESC 
        LIMIT 10`;

    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Client කෙනෙක්ව Verify කිරීම සඳහා API එක
app.put('/api/admin/clients/:id/verify', (req, res) => {
    const clientId = req.params.id; // URL එකෙන් එන ID එක
    const { isVerified } = req.body; 

    // වැදගත්: clientId එක Number එකක් බවට පත් කරන්න (ඔයාගේ DB එකේ id එක INT නම්)
    const query = "UPDATE users SET isVerified = ? WHERE id = ?";
    
    db.query(query, [isVerified ? 1 : 0, clientId], (err, result) => {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }
        
        // ඇත්තටම row එකක් update වුනාද කියලා බලන්න
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "User not found or ID mismatch" });
        }

        res.json({ success: true, message: "Client status updated" });
    });
});

// --- CLIENT DASHBOARD API FIXES ---

// 1. User ගේ සියලුම Licenses (Software) ලබා ගැනීම
app.get('/api/licenses/user/:userId', (req, res) => {
    const { userId } = req.params;
    
    // Query එකේදී අපිට අවශ්‍ය columns විතරක් තෝරා ගමු
    const query = `
        SELECT 
            l.id as licenseId,
            l.licenseKey,
            l.softwareId,
            l.status,
            l.createdAt,
            s.name as softwareName, 
            s.description,
            s.imageUrl,
            s.productLinks  -- මෙතන තමයි download links තියෙන්නේ
        FROM licenses l
        INNER JOIN software s ON l.softwareId = s.id  
        WHERE l.userId = ? AND l.status = 'active'
        ORDER BY l.createdAt DESC`;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error("❌ Fetch Licenses Error:", err.message);
            return res.status(500).json({ error: err.message });
        }

        // 💡 වැදගත්: productLinks String එකක් නම් ඒක JSON එකක් බවට පත් කරන්න ඕනේ
        const formattedResults = results.map(row => {
            let parsedLinks = null;
            try {
                // database එකෙන් එන්නේ string එකක් නම් parse කරන්න
                parsedLinks = typeof row.productLinks === 'string' 
                    ? JSON.parse(row.productLinks) 
                    : row.productLinks;
            } catch (e) {
                console.error("Parsing Error for productLinks:", e);
                parsedLinks = []; // වැරදුනොත් හිස් list එකක් යවන්න
            }

            return {
                ...row,
                productLinks: parsedLinks
            };
        });

        res.json(formattedResults);
    });
});

// 2. User ගේ සියලුම Invoices (ගෙවීම් ඉතිහාසය) ලබා ගැනීම
app.get('/api/invoices/user/:userId', (req, res) => {
    const { userId } = req.params;
    const query = `SELECT * FROM purchases WHERE userId = ? ORDER BY createdAt DESC`;

    db.query(query, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/admin/clients', (req, res) => {
    // අපි users table එකේ තියෙන අපිට අවශ්‍ය ඔක්කොම columns ටික SELECT කරගමු
    // ඔයාගේ table එකේ companyName column එකක් තියෙනවා නම් ඒකත් මෙතනට දාන්න
    const query = `
        SELECT 
            id, 
            fullName, 
            email, 
            phone,
            nic,
            companyName,
            isVerified,
            createdAt, 
            role 
        FROM users 
        WHERE role = 'client' 
        ORDER BY createdAt DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).json({ 
                success: false, 
                message: "Internal Server Error", 
                error: err.message 
            });
        }
        
        // Frontend එකට කෙලින්ම array එක යවනවා
        res.json(results);
    });
});

// 1. අලුත් Review එකක් සේව් කිරීම
app.post('/api/reviews', (req, res) => {
    const { softwareId, userId, fullName, rating, comment } = req.body;
    
    const query = `INSERT INTO reviews (softwareId, userId, fullName, rating, comment) VALUES (?, ?, ?, ?, ?)`;
    
    db.query(query, [softwareId, userId, fullName, rating, comment], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: 'Review added successfully!' });
    });
});

// 2. සොෆ්ට්වෙයාර් එකකට අදාළ සියලුම Reviews ලබාගැනීම
app.get('/api/reviews/:softwareId', (req, res) => {
    const { softwareId } = req.params;
    const query = `SELECT * FROM reviews WHERE softwareId = ? ORDER BY createdAt DESC`;
    
    db.query(query, [softwareId], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json(results);
    });
});

// Admin reply එක update කිරීමට
app.put('/api/reviews/reply/:id', async (req, res) => {
    const { id } = req.params;
    const { replyText } = req.body;
    const replyDate = new Date();

    const sql = "UPDATE reviews SET reply_text = ?, reply_date = ? WHERE id = ?";
    
    db.query(sql, [replyText, replyDate, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Reply added successfully!" });
    });
});

// Admin Dashboard එකට ඕන කරන Pending Reviews ටික ගැනීම
app.get('/api/admin/reviews/pending', (req, res) => {
    const query = `
        SELECT r.*, s.name as softwareName 
        FROM reviews r 
        JOIN software s ON r.softwareId = s.id 
        WHERE r.reply_text IS NULL OR r.reply_text = ''
        ORDER BY r.createdAt DESC`;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- 1. LICENSE VERIFICATION API ---
// POS එකේ පළවෙනි පියවරේදී (Step 1) License Key එක සහ Branch එක පරීක්ෂා කිරීම
app.post('/api/verify-license', (req, res) => {
    const { licenseKey } = req.body; // දැන් branchName අනිවාර්ය නැහැ Step 1 වලදී

    if (!licenseKey) {
        return res.status(400).json({ success: false, message: "Missing License Key" });
    }

    // 1. මුලින්ම ලයිසන් එක ඇක්ටිව් ද කියලා බලනවා
    const licenseSql = `SELECT * FROM licenses WHERE licenseKey = ? AND status = 'active'`;

    db.query(licenseSql, [licenseKey], (err, licenseResults) => {
        if (err) {
            console.error("❌ SQL Error (License):", err.message);
            return res.status(500).json({ success: false, message: "Internal Server Error" });
        }

        if (licenseResults.length > 0) {
            const licenseData = licenseResults[0];

            // 2. මේ ලයිසන් එකට අදාළව දැනට තියෙන බ්‍රාන්ච් ටික හොයනවා
            const branchSql = `SELECT id, branch_name, business_name, address, phone, telegram_bot_token, telegram_chat_id FROM branches WHERE licenseKey = ?`;
            
            db.query(branchSql, [licenseKey], (bErr, branchResults) => {
                if (bErr) {
                    console.error("❌ SQL Error (Branches):", bErr.message);
                    return res.status(500).json({ success: false, message: "Error fetching branches" });
                }

                // සාර්ථකයි! ලයිසන් දත්ත සහ දැනට තියෙන බ්‍රාන්ච් ලිස්ට් එක යවනවා
                res.json({ 
                    success: true, 
                    message: "License Valid",
                    userId: licenseData.userId,
                    maxActivations: licenseData.maxActivations,
                    currentActivations: licenseData.currentActivations,
                    existingBranches: branchResults // මෙන්න මේ ලිස්ට් එක තමයි Frontend Dropdown එකට යන්නේ
                });
            });

        } else {
            res.json({ success: false, message: "වලංගු නොවන හෝ අත්හිටුවන ලද ලයිසන් කේතයකි." });
        }
    });
});

// --- 2. BRANCH SETUP API ---
// POS එකේ දෙවැනි පියවරේදී (Step 2) සියලුම විස්තර branches ටේබල් එකට සේව් කිරීම
app.post('/api/setup-branch', (req, res) => {
    const { licenseKey, branchName, businessName, phone, address, botToken, chatId, hwid } = req.body;

    // 🔴 මෙතනදී අපි HWID එක විතරක් නෙවෙයි, බ්‍රාන්ච් නම සහ ලයිසන් එකත් බලනවා.
    // එතකොට පරණ පේළියේ HWID එක NULL වුණත් බ්‍රාන්ච් නම ගැලපෙන නිසා ඒක අහුවෙනවා.
    const checkSql = `SELECT id FROM branches WHERE (hwid = ? OR branch_name = ?) AND licenseKey = ?`;
    
    db.query(checkSql, [hwid, branchName, licenseKey], (err, results) => {
        if (err) {
            console.error("❌ Database Error (Check):", err);
            return res.status(500).json({ success: false, message: "Database check error" });
        }

        if (results.length > 0) {
            // ✅ දැනටමත් පේළියක් තියෙනවා! (Update කරනවා)
            const branchId = results[0].id;
            
            // 🔴 වැදගත්: UPDATE කරද්දී HWID එකත් Database එකට දාන්න ඕනේ!
            const updateSql = `UPDATE branches SET 
                business_name = ?, address = ?, phone = ?, 
                telegram_bot_token = ?, telegram_chat_id = ?, 
                hwid = ? -- මෙතනදී තමයි NULL වෙලා තිබුණ එකට අගය වැටෙන්නේ
                WHERE id = ?`;

            const updateValues = [businessName, address, phone, botToken, chatId, hwid, branchId];

            db.query(updateSql, updateValues, (updErr) => {
                if (updErr) {
                    console.error("❌ SQL Error (Update):", updErr.message);
                    return res.status(500).json({ success: false, message: "Branch update failed" });
                }
                console.log("♻️ Branch Updated & HWID Fixed for:", branchName);
                return res.json({ success: true, message: "Updated successfully!", branchId: branchId });
            });

        } else {
            // 🆕 සම්පූර්ණයෙන්ම අලුත් එකක් නම් (Insert)
            db.query('SELECT userId FROM licenses WHERE licenseKey = ?', [licenseKey], (lErr, lRes) => {
                if (lErr || lRes.length === 0) return res.status(404).json({ success: false, message: "License failed" });

                const userId = lRes[0].userId;
                const insertSql = `INSERT INTO branches 
                    (userId, licenseKey, business_name, branch_name, hwid, address, phone, telegram_bot_token, telegram_chat_id) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                const insertValues = [userId, licenseKey, businessName, branchName, hwid, address, phone, botToken, chatId];

                db.query(insertSql, insertValues, (insErr, result) => {
                    if (insErr) return res.status(500).json({ success: false, message: "Insert failed" });
                    
                    db.query('UPDATE licenses SET currentActivations = currentActivations + 1 WHERE licenseKey = ?', [licenseKey]);
                    res.json({ success: true, message: "New Branch Setup Success!", branchId: result.insertId });
                });
            });
        }
    });
});
// --- POS VALIDATION & SYNC API ---

// 1. Session එක සහ HWID එක පරීක්ෂා කිරීම
app.post('/api/pos/validate-session', (req, res) => {
    const { licenseKey, branchId, hwid } = req.body;

    // 1. ලයිසන් එක සහ බ්‍රාන්ච් එක පරීක්ෂා කිරීම
    const query = `
        SELECT l.status, l.expiresAt, b.business_name, l.maxActivations 
        FROM licenses l 
        JOIN branches b ON l.licenseKey = b.licenseKey 
        WHERE l.licenseKey = ? AND b.id = ?`;

    db.query(query, [licenseKey, branchId], (err, results) => {
        if (err || results.length === 0) {
            return res.json({ success: false, message: "මෙම පද්ධතිය සක්‍රීය කර නැත හෝ දත්ත දෝෂයකි. කරුණාකර නැවත ස්ථාපනය කරන්න." });
        }

        const license = results[0];

        // 2. Status එක Check කිරීම
        if (license.status !== 'active') {
            return res.json({ success: false, message: `ඔබේ ලයිසන් එක දැනට ${license.status} තත්වයේ පවතී. කරුණාකර සහාය ලබා ගන්න.` });
        }

        // 3. Expiry Date එක Check කිරීම
        if (new Date(license.expiresAt) < new Date()) {
            return res.json({ success: false, message: "ඔබේ බලපත්‍ර කාලය අවසන් වී ඇත (Expired). කරුණාකර එය අලුත් කරගන්න." });
        }

        // 4. (වැදගත්) මෙතනදී ඔයාට පුළුවන් HWID එක වෙනම ටේබල් එකක සේව් කරලා 
        // branch එකකට අදාළ PC ගණන සීමා කරන්න (Branch Limit).
        
        res.json({ 
            success: true, 
            pack: "Premium", // DB එකෙන් එන විදියට වෙනස් කරන්න
            businessName: license.business_name 
        });
    });
});

// 2. බ්‍රාන්ච් එකට අදාළ සියලුම දත්ත එකවර ලබා ගැනීම (Sync)
app.get('/api/pos/sync/:branchId', (req, res) => {
    const { branchId } = req.params;

    // මෙතනදී අපි Inventory සහ Users කියන ටේබල් දෙකෙන්ම දත්ත ගන්නවා
    // (දැනට සරලව Inventory එක පමණක් පෙන්වමි)
    const invQuery = "SELECT * FROM inventory WHERE branchId = ?";
    const userQuery = "SELECT name, user, role, telegram FROM users WHERE branchId = ?";

    db.query(invQuery, [branchId], (err, invResults) => {
        db.query(userQuery, [branchId], (err2, userResults) => {
            res.json({
                success: true,
                inventory: invResults,
                users: userResults,
                categories: ["Grocery", "Electronics", "Hardware"] // මේවා DB එකෙන් ගන්නත් පුළුවන්
            });
        });
    });
});

app.post('/api/register-staff', (req, res) => {
    const { branch_id, full_name, username, password, role, telegram_id, card_id } = req.body;

    const sql = `INSERT INTO staff 
                 (branch_id, full_name, username, password, role, telegram_id, card_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const values = [branch_id, full_name, username, password, role, telegram_id, card_id];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("❌ Staff Register Error:", err);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ success: false, message: "මෙම Username එක දැනටමත් පද්ධතියේ ඇත." });
            }
            return res.status(500).json({ success: false, message: "Database error" });
        }

        res.json({ success: true, message: "Staff registered successfully!", staffId: result.insertId });
    });
});

// POST: /api/pos/login
app.post('/api/pos/login', (req, res) => {
    const { username, password, branchId, deviceInfo } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    const sql = `SELECT id, full_name as name, username as user, role 
                 FROM staff 
                 WHERE username = ? AND password = ? AND branch_id = ?`;

    db.query(sql, [username, password, branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });

        if (results.length > 0) {
            const user = results[0];

            // මෙතනදී user.role එකත් INSERT කරනවා
            const logSql = `INSERT INTO system_logs (branch_id, user_name, user_role, login_time, device_info, status) 
                            VALUES (?, ?, ?, NOW(), ?, 'Active')`;
            
            db.query(logSql, [branchId, user.name, user.role, deviceInfo], (logErr, logResult) => {
                const currentLogId = logResult ? logResult.insertId : null;

                const attSql = `INSERT INTO attendance (branch_id, staff_id, employee_name, login_time, date) 
                                VALUES (?, ?, ?, NOW(), ?)`;
                
                db.query(attSql, [branchId, user.id, user.name, today], (attErr, attResult) => {
                    res.json({ 
                        success: true, 
                        user: user, 
                        logId: currentLogId,
                        attId: attResult ? attResult.insertId : null
                    });
                });
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials" });
        }
    });
});

// 1. ලොගින් වෙද්දී Log එකක් සේව් කිරීම
app.post('/api/pos/save-log', (req, res) => {
    const { branchId, userName, deviceInfo } = req.body;
    const sql = `INSERT INTO system_logs (branch_id, user_name, login_time, device_info, status) 
                 VALUES (?, NOW(), ?, ?, 'Active')`;

    db.query(sql, [branchId, userName, deviceInfo], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, logId: result.insertId });
    });
});

// 2. දැනට ඉන්න Active Users ලා dashboard එකට ලබා ගැනීම
app.get('/api/pos/active-users/:branchId', (req, res) => {
    const branchId = req.params.branchId;
    
    // කෙලින්ම system_logs එකෙන් fullName සහ role එක ගන්නවා
    const sql = `
        SELECT user_name as fullName, user_role as role, login_time as loginTime 
        FROM system_logs 
        WHERE branch_id = ? AND status = 'Active' 
        ORDER BY login_time DESC`;

    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: results });
    });
});

app.post('/api/pos/logout', (req, res) => {
    const { logId, attId } = req.body; // IDs දෙකම ගන්නවා

    // System Log එක Offline කරනවා
    const sql1 = `UPDATE system_logs SET logout_time = NOW(), status = 'Offline' WHERE id = ?`;
    // Attendance එකේ Logout time සහ වැඩ කළ පැය ගණන හදනවා
    const sql2 = `UPDATE attendance SET logout_time = NOW(), daily_total_hours = TIMEDIFF(NOW(), login_time) WHERE id = ?`;

    db.query(sql1, [logId], () => {
        if (attId) {
            db.query(sql2, [attId], () => {
                res.json({ success: true });
            });
        } else {
            res.json({ success: true });
        }
    });
});

// GET: සියලුම ලොග් විස්තර ලබා ගැනීම
// --- User Logs API ---
app.get('/api/pos/all-logs/:branchId', (req, res) => {
    const branchId = req.params.branchId;
    
    // බ්‍රවුසරය cache කරන එක නවත්වන headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const sql = `SELECT user_name as user, login_time as loginTime, logout_time as logoutTime, status, device_info as device 
                 FROM system_logs 
                 WHERE branch_id = ? 
                 ORDER BY login_time DESC LIMIT 100`;

    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, logs: results });
    });
});

// --- Attendance History API ---
app.get('/api/pos/attendance-history/:branchId', (req, res) => {
    const branchId = req.params.branchId;

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const sql = `SELECT DATE_FORMAT(date, '%Y-%m-%d') as date, 
                 employee_name, login_time, logout_time, daily_total_hours 
                 FROM attendance WHERE branch_id = ? ORDER BY id DESC LIMIT 50`;
    
    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, records: results });
    });
});

// GET: අදාළ ශාඛාවේ සියලුම Staff මෙම්බර්ස්ලා ලබා ගැනීම
app.get('/api/pos/staff/:branchId', (req, res) => {
    const branchId = req.params.branchId;
    const sql = `SELECT id, full_name as name, username as user, role, telegram_id as telegramId 
                 FROM staff 
                 WHERE branch_id = ?`;

    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, staff: results });
    });
});

app.post('/api/pos/delete-staff', (req, res) => {
    const { id } = req.body;
    db.query("DELETE FROM staff WHERE id = ?", [id], (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

// --- Business Logo Upload Configuration ---

// ලෝගෝ සේව් කරන තැන ලෑස්ති කිරීම (Identifier එක 'logoStorage' ලෙස වෙනස් කළා)
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads/logos/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // body එකේ branchId නැති වුණොත් 'unknown' කියලා වැටෙන්න හදල තියෙන්නේ
        const bID = req.body.branchId || 'unknown';
        cb(null, `logo_${bID}_${Date.now()}${path.extname(file.originalname)}`);
    }
});

// Middleware එක 'logoUpload' ලෙස නම් කළා
const logoUpload = multer({ storage: logoStorage });

// --- API Endpoint: Logo සහ Settings Update කිරීම ---
app.post('/api/pos/update-settings', (req, res) => {
    // දැන් අපි FormData වෙනුවට JSON විදිහට Base64 එක යවමු (ලේසි වෙන්න)
    const { branchId, billFooter, currency, logoBase64 } = req.body;

    // මෙතන logo_url එකටම අපි Base64 string එක දානවා (Database එකේ TEXT හෝ LONGTEXT field එකක් වෙන්න ඕනේ)
    const sql = `
        INSERT INTO settings (branch_id, logo_url, bill_footer, currency) 
        VALUES (?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE 
        logo_url = IFNULL(VALUES(logo_url), logo_url), 
        bill_footer = IFNULL(VALUES(bill_footer), bill_footer), 
        currency = IFNULL(VALUES(currency), currency)`;

    db.query(sql, [branchId, logoBase64, billFooter, currency], (err, result) => {
        if (err) {
            console.error("❌ SQL Error (Settings):", err);
            return res.status(500).json({ success: false, message: "Settings Update Failed" });
        }
        res.json({ 
            success: true, 
            logoUrl: logoBase64, // මෙතන දැන් URL එක වෙනුවට Base64 එකම ආපහු යවනවා
            message: "Settings Updated Successfully!" 
        });
    });
});

// --- API Endpoint: Settings ලබා ගැනීම ---
app.get('/api/pos/get-settings/:branchId', (req, res) => {
    const branchId = req.params.branchId;
    const sql = `SELECT * FROM settings WHERE branch_id = ?`;

    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, data: results[0] || {} });
    });
});

// --- 📦 Inventory API: Save or Update Item ---
app.post('/api/pos/save-inventory', (req, res) => {
    // 💡 Frontend එකෙන් එන නම් මෙතන හරියටම තියෙන්න ඕනේ
    const { 
        branchId, barcode, name, category, cost, sale, 
        stock, lowStockLimit, saleType, itemDiscount, disc_type 
    } = req.body;

    const sql = `
        INSERT INTO inventory 
        (branch_id, barcode, item_name, category, cost_price, sale_price, stock_qty, low_stock_limit, sale_type, discount, disc_type) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE 
        item_name = VALUES(item_name),
        category = VALUES(category),
        cost_price = VALUES(cost_price),
        sale_price = VALUES(sale_price),
        stock_qty = VALUES(stock_qty),
        low_stock_limit = VALUES(low_stock_limit),
        sale_type = VALUES(sale_type),
        discount = VALUES(discount),
        disc_type = VALUES(disc_type)`;

    // 💡 අගයන් 11ක් පිළිවෙලට තිබිය යුතුයි
    const values = [
        branchId, barcode, name, category, cost, sale, 
        stock, lowStockLimit, saleType, itemDiscount, disc_type
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("❌ SQL Error:", err.sqlMessage);
            return res.status(500).json({ success: false, message: err.sqlMessage });
        }
        res.json({ success: true, message: "Inventory Synced Successfully!" });
    });
});

// --- 📦 Inventory API: Get All Items for Branch ---
app.get('/api/pos/get-inventory/:branchId', (req, res) => {
    const sql = `SELECT * FROM inventory WHERE branch_id = ?`;
    db.query(sql, [req.params.branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, data: results });
    });
});

// --- 📂 Category API: Add Category ---
app.post('/api/pos/add-category', (req, res) => {
    const { branchId, categoryName } = req.body;
    const sql = `INSERT INTO categories (branch_id, category_name) VALUES (?, ?)`;
    
    db.query(sql, [branchId, categoryName], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: "Category already exists!" });
            return res.status(500).json({ success: false, message: "Database Error" });
        }
        res.json({ success: true, message: "Category Added!" });
    });
});

// --- 📂 Category API: Delete Category ---
app.post('/api/pos/delete-category', (req, res) => {
    const { branchId, categoryName } = req.body;
    const sql = `DELETE FROM categories WHERE branch_id = ? AND category_name = ?`;
    
    db.query(sql, [branchId, categoryName], (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: "Category Deleted!" });
    });
});

// --- 📂 Category API: Get Categories ---
app.get('/api/pos/get-categories/:branchId', (req, res) => {
    const sql = `SELECT category_name FROM categories WHERE branch_id = ?`;
    db.query(sql, [req.params.branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        const catList = results.map(row => row.category_name);
        res.json({ success: true, data: catList });
    });
});

// --- 📦 Inventory API: Delete Item ---
app.post('/api/pos/delete-inventory', (req, res) => {
    const { branchId, barcode } = req.body;

    const sql = `DELETE FROM inventory WHERE branch_id = ? AND barcode = ?`;
    
    db.query(sql, [branchId, barcode], (err, result) => {
        if (err) {
            console.error("❌ Delete Error:", err);
            return res.status(500).json({ success: false, message: "Database Error" });
        }
        res.json({ success: true, message: "Item Deleted Successfully!" });
    });
});


// 1. Sales History එක ලබාගැනීමේ API එක
app.get('/api/pos/get-sales/:branchId', (req, res) => {
    const branchId = req.params.branchId;

    // MySQL Query එක - සියලුම අවශ්‍ය දත්ත (items_json ඇතුළුව) ලබාගන්නවා
    const query = `
        SELECT 
            bill_id, 
            cashier_name, 
            items_summary, 
            items_json, 
            customer_phone, 
            payment_method, 
            sub_total, 
            discount_total, 
            net_total, 
            created_at 
        FROM sales_history 
        WHERE branch_id = ? 
        ORDER BY created_at DESC
    `;

    db.query(query, [branchId], (err, results) => {
        if (err) {
            console.error("❌ Database Error:", err);
            return res.status(500).json({ success: false, message: "Internal Server Error" });
        }

        // දත්ත ටික Frontend එකට යවන්න කලින් පිරිසිදු කරමු (Formatting)
        const formattedData = results.map(sale => {
            let parsedItems = [];
            
            // 🟢 items_json එක පරීක්ෂා කර Array එකක් බවට පත් කිරීම
            if (sale.items_json) {
                try {
                    parsedItems = typeof sale.items_json === 'string' ? JSON.parse(sale.items_json) : sale.items_json;
                } catch (e) {
                    console.error("❌ JSON Parse Error for bill:", sale.bill_id, e);
                    parsedItems = []; // Error එකක් ආවොත් හිස් array එකක් යවනවා
                }
            }

            return {
                ...sale,
                items_json: parsedItems, // දැන් මේක හැමතිස්සෙම JSON Array එකක් විදිහට යනවා
                // කියවන්න පුළුවන් වෙලාවක් සහ දිනයක් එකතු කිරීම
                formatted_date: sale.created_at ? new Date(sale.created_at).toLocaleString('en-GB') : ''
            };
        });

        // අවසාන දත්ත ටික JSON response එකක් ලෙස යැවීම
        res.json({
            success: true,
            data: formattedData
        });
    });
});

// 2. අලුත් Sale එකක් Save කිරීමේ API එක
app.post('/api/pos/save-sale', (req, res) => {
    const { 
        branch_id, 
        bill_id, 
        cashier_name, 
        items_summary, 
        items_json, // 🟢 අලුතෙන් එකතු කළා
        customer_phone, 
        payment_method, 
        sub_total, 
        discount_total, 
        net_total 
    } = req.body;

    const query = `
        INSERT INTO sales_history 
        (branch_id, bill_id, cashier_name, items_summary, items_json, customer_phone, payment_method, sub_total, discount_total, net_total, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    // 🟢 values array එකටත් items_json එකතු කළා
    const values = [
        branch_id, 
        bill_id, 
        cashier_name, 
        items_summary, 
        items_json, 
        customer_phone, 
        payment_method, 
        sub_total, 
        discount_total, 
        net_total
    ];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error("❌ Insert Error:", err);
            return res.status(500).json({ success: false, message: "Failed to save sale" });
        }
        res.json({ success: true, message: "Sale saved successfully" });
    });
});

app.post('/api/pos/complete-sale', (req, res) => {
    const s = req.body;
    const branchId = s.branchId;
    
    // Frontend එකෙන් එවන items_json එක (String එකක් නම් parse කරගන්නවා)
    let items = [];
    try {
        items = typeof s.items_json === 'string' ? JSON.parse(s.items_json) : s.items_json;
    } catch (e) {
        console.error("❌ JSON Parse Error:", e);
        return res.status(400).json({ success: false, message: "Invalid items data" });
    }

    // 1. Sales History එකට බිල ඇතුළත් කිරීම (අලුත් items_json column එකත් සමඟ)
    const saleQuery = `INSERT INTO sales_history 
    (branch_id, bill_id, cashier_name, items_summary, items_json, customer_phone, payment_method, sub_total, discount_total, net_total, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;

    const saleValues = [
        branchId, 
        s.bill_id, 
        s.cashier_name, 
        s.items_summary, 
        s.items_json, // 🟢 සම්පූර්ණ කාර්ට් එකම JSON එකක් විදිහට සේව් වෙනවා
        s.customer_phone, 
        s.payment_method, 
        s.sub_total, 
        s.discount_total, 
        s.net_total
    ];

    db.query(saleQuery, saleValues, (err, result) => {
        if (err) {
            console.error("❌ SQL Error (Sales):", err);
            return res.status(500).json({ success: false, message: "Error saving sale" });
        }

        // 2. භාණ්ඩ එකින් එක loop කර Stock එක Update කිරීම (ඔයාගේ මුල් ලොජික් එකමයි)
        let updateErrors = 0;
        let completedUpdates = 0;

        if (!items || items.length === 0) {
            return res.json({ success: true, message: "Sale saved, but no items to update stock." });
        }

        items.forEach(item => {
            // Return එකක් නම් stock එක එකතු කරනවා (+), නැත්නම් අඩු කරනවා (-)
            const qtyChange = item.isExchange ? `+ ${Math.abs(item.qty)}` : `- ${Math.abs(item.qty)}`;
            
            const updateStockQuery = `
                UPDATE inventory 
                SET stock_qty = stock_qty ${qtyChange} 
                WHERE barcode = ? AND branch_id = ?`;

            db.query(updateStockQuery, [item.barcode, branchId], (uErr, uResult) => {
                completedUpdates++;
                if (uErr) {
                    console.error(`❌ Stock Update Error (Barcode: ${item.barcode}):`, uErr);
                    updateErrors++;
                }

                // සියලුම අයිටම් update වී අවසන් නම් පමණක් Response එක යවමු
                if (completedUpdates === items.length) {
                    if (updateErrors > 0) {
                        res.json({ success: true, message: "Sale saved, but some stock levels failed to update." });
                    } else {
                        res.json({ success: true, message: "Sale completed & Inventory updated!" });
                    }
                }
            });
        });
    });
});

// 📦 1. Backup Record එකක් Save කිරීම
app.post('/api/pos/save-backup-log', (req, res) => {
    const { branch_id, backup_date, backup_time, reference_id, status } = req.body;
    
    const query = `INSERT INTO backup_logs (branch_id, backup_date, backup_time, reference_id, status) VALUES (?, ?, ?, ?, ?)`;
    const values = [branch_id, backup_date, backup_time, reference_id, status];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error("❌ SQL Error (Backup Log):", err);
            return res.status(500).json({ success: false, message: "Database Error" });
        }
        res.json({ success: true, message: "Backup Logged!" });
    });
});

// 📂 2. Backup History එක ලබාගැනීම
app.get('/api/pos/get-backups/:branchId', (req, res) => {
    const branchId = req.params.branchId;
    const query = `SELECT * FROM backup_logs WHERE branch_id = ? ORDER BY id DESC LIMIT 20`;

    db.query(query, [branchId], (err, results) => {
        if (err) {
            console.error("❌ SQL Error (Get Backups):", err);
            return res.status(500).json({ success: false, message: "Database Error" });
        }
        res.json({ success: true, data: results });
    });
});

// Frontend එකෙන් branch_id එක එවපුවම හැම ටේබල් එකකම දත්ත එකතු කරලා යවනවා
app.get('/api/pos/get-full-backup-data', (req, res) => {
    const { branch_id } = req.query;

    if (!branch_id) {
        return res.status(400).json({ success: false, message: "Branch ID is required" });
    }

    // හැම Table එකකටම අදාළ Queries ටික
    const queries = {
        inventory: "SELECT * FROM inventory WHERE branch_id = ?",
        sales: "SELECT * FROM sales_history WHERE branch_id = ?",
        attendance: "SELECT * FROM attendance WHERE branch_id = ?",
        staff: "SELECT * FROM staff WHERE branch_id = ?",
        logs: "SELECT * FROM system_logs WHERE branch_id = ?",
        categories: "SELECT * FROM categories WHERE branch_id = ?",
        settings: "SELECT * FROM settings WHERE branch_id = ?"
    };

    // Results ටික එකතු කරගන්න object එකක්
    let backupData = {};

    // එකින් එක Query එක Run කරනවා (Callback nesting වලට වඩා ලේසි වෙන්න මෙහෙම කළා)
    db.query(queries.inventory, [branch_id], (err, invRes) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        backupData.inventory = invRes;

        db.query(queries.sales, [branch_id], (err, saleRes) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            backupData.sales = saleRes;

            db.query(queries.attendance, [branch_id], (err, attRes) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                backupData.attendance = attRes;

                db.query(queries.staff, [branch_id], (err, staffRes) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    backupData.staff = staffRes;

                    db.query(queries.logs, [branch_id], (err, logRes) => {
                        if (err) return res.status(500).json(err);
                        backupData.logs = logRes;

                        db.query(queries.categories, [branch_id], (err, catRes) => {
                            if (err) return res.status(500).json(err);
                            backupData.categories = catRes;

                            db.query(queries.settings, [branch_id], (err, setRes) => {
                                if (err) return res.status(500).json(err);
                                backupData.settings = setRes;

                                // සියලුම දත්ත ලැබුණු පසු ප්‍රතිචාරය යැවීම
                                res.json({
                                    success: true,
                                    data: backupData
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// --- POS SYSTEM FULL RESTORE API ---
// JSON එකෙන් එන දත්ත ටික Database එකේ Tables වලට ලියනවා
app.post('/api/pos/restore-full-backup', async (req, res) => {
    const { branch_id, data } = req.body;

    if (!branch_id || !data) {
        return res.status(400).json({ success: false, message: "Missing branch_id or data" });
    }

    try {
        // 1. කලින් තිබුණු දත්ත අයින් කිරීම (අදාළ branch එකට පමණක්)
        // මේක කරන්නේ අලුත් දත්ත එක්ක පරණ ඒවා පටලැවෙන්නේ නැති වෙන්නයි
        const clearTables = [
            "DELETE FROM inventory WHERE branch_id = ?",
            "DELETE FROM sales_history WHERE branch_id = ?",
            "DELETE FROM attendance WHERE branch_id = ?",
            "DELETE FROM staff WHERE branch_id = ?",
            "DELETE FROM system_logs WHERE branch_id = ?",
            "DELETE FROM categories WHERE branch_id = ?",
            "DELETE FROM settings WHERE branch_id = ?"
        ];

        for (let query of clearTables) {
            await db.promise().query(query, [branch_id]);
        }

        // 2. Inventory Restore
        if (data.inventory && data.inventory.length > 0) {
            const invValues = data.inventory.map(i => [
                branch_id, i.item_name || i.name, i.barcode, i.category, 
                i.cost_price || i.cost, i.sale_price || i.sale, i.discount || i.itemDiscount, 
                i.disc_type || i.discType, i.stock_qty || i.stock, i.low_stock_limit || i.lowStockLimit, i.sale_type || i.saleType
            ]);
            await db.promise().query(`INSERT INTO inventory (branch_id, item_name, barcode, category, cost_price, sale_price, discount, disc_type, stock_qty, low_stock_limit, sale_type) VALUES ?`, [invValues]);
        }

        // 3. Sales History Restore
        if (data.sales && data.sales.length > 0) {
            const saleValues = data.sales.map(s => [
                branch_id, s.bill_id, s.cashier_name, s.items_summary, 
                typeof s.items === 'object' ? JSON.stringify(s.items) : (s.items_json || '[]'),
                s.customer_phone, s.payment_method, s.sub_total, s.discount_total, s.net_total, s.created_at
            ]);
            await db.promise().query(`INSERT INTO sales_history (branch_id, bill_id, cashier_name, items_summary, items_json, customer_phone, payment_method, sub_total, discount_total, net_total, created_at) VALUES ?`, [saleValues]);
        }

        // 4. Staff Restore
        if (data.staff && data.staff.length > 0) {
            const staffValues = data.staff.map(s => [branch_id, s.card_id, s.full_name, s.username, s.password, s.role, s.telegram_id]);
            await db.promise().query(`INSERT INTO staff (branch_id, card_id, full_name, username, password, role, telegram_id) VALUES ?`, [staffValues]);
        }

        // 5. Attendance Restore
        if (data.attendance && data.attendance.length > 0) {
            const attValues = data.attendance.map(a => [branch_id, a.card_id, a.full_name, a.date, a.in_time, a.out_time, a.status]);
            await db.promise().query(`INSERT INTO attendance (branch_id, card_id, full_name, date, in_time, out_time, status) VALUES ?`, [attValues]);
        }

        // 6. Logs Restore
        if (data.logs && data.logs.length > 0) {
            const logValues = data.logs.map(l => [branch_id, l.user_name, l.user_role, l.login_time, l.logout_time, l.device_info, l.status]);
            await db.promise().query(`INSERT INTO system_logs (branch_id, user_name, user_role, login_time, logout_time, device_info, status) VALUES ?`, [logValues]);
        }

        // 7. Categories & Settings
        if (data.categories && data.categories.length > 0) {
            const catValues = data.categories.map(c => [branch_id, c.name, c.display_name]);
            await db.promise().query(`INSERT INTO categories (branch_id, name, display_name) VALUES ?`, [catValues]);
        }
        
        // Settings සාමාන්‍යයෙන් Object එකක් නිසා ඒක වෙනම Handle කරන්න ඕනේ (ඔයාගේ table එක අනුව)
        // දැනට සරලව log එකක් විතරක් දාන්නම්

        res.json({ success: true, message: "Database tables restored successfully!" });

    } catch (error) {
        console.error("❌ Restore API Error:", error);
        res.status(500).json({ success: false, message: "Database restore failed", error: error.message });
    }
});

// Barcode Login API
app.post('/api/pos/barcode-login', (req, res) => {
    const { cardId, branchId } = req.body;

    // Card ID එක සහ Branch ID එක අනුව යූසර්ව සොයන Query එක
    const sql = `SELECT * FROM staff WHERE card_id = ? AND branch_id = ? LIMIT 1`;

    db.query(sql, [cardId, branchId], (err, results) => {
        if (err) {
            console.error("❌ SQL Error:", err);
            return res.status(500).json({ success: false, message: "Database Error" });
        }

        if (results.length > 0) {
            const user = results[0];
            // Security සඳහා password එක response එකෙන් අයින් කරනවා
            delete user.password; 
            
            res.json({ 
                success: true, 
                user: {
                    id: user.id,
                    name: user.full_name,
                    user: user.username,
                    role: user.role,
                    cardID: user.card_id
                }
            });
        } else {
            res.json({ success: false, message: "Invalid Card ID" });
        }
    });
});


// ============================================================================
// 📱 MOBILE APP API ROUTES (READ ONLY / VIEW ONLY)
// ============================================================================
// මේවා Mobile App එකෙන් දත්ත බැලීමට පමණක් භාවිතා වේ.

// 1. Mobile App: License Key Verification
// (branches ටේබල් එක හරහා පරීක්ෂා කර අදාළ ශාඛා ලැයිස්තුව යවයි)
app.post('/api/mobile/verify-license', (req, res) => {
    const { license_key } = req.body;

    if (!license_key) {
        return res.status(400).json({ success: false, message: "License key is required." });
    }

    const sql = `SELECT id, branch_name, business_name, address, phone 
                 FROM branches 
                 WHERE licenseKey = ?`;

    db.query(sql, [license_key], (err, results) => {
        if (err) {
            console.error("❌ Mobile API Error (verify-license):", err);
            return res.status(500).json({ success: false, message: "Database error." });
        }

        if (results.length > 0) {
            // Mobile app එක බලාපොරොත්තු වෙන 'data' array එක යවමු
            res.json({ success: true, data: results });
        } else {
            res.json({ success: false, message: "Invalid license key or no branches found." });
        }
    });
});

// 2. Mobile App: Staff Login
app.post('/api/mobile/login', (req, res) => {
    const { username, password, branchId } = req.body;

    const sql = `SELECT id, full_name as name, username as user, role 
                 FROM staff 
                 WHERE username = ? AND password = ? AND branch_id = ?`;

    db.query(sql, [username, password, branchId], (err, results) => {
        if (err) {
            console.error("❌ Mobile API Error (login):", err);
            return res.status(500).json({ success: false, message: "Database error." });
        }

        if (results.length > 0) {
            res.json({ success: true, user: results[0] });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials or branch mismatch." });
        }
    });
});

// 3. Mobile App: Get Inventory
app.get('/api/mobile/inventory/:branchId', (req, res) => {
    const branchId = req.params.branchId;
    const sql = `SELECT * FROM inventory WHERE branch_id = ?`;
    
    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error." });
        res.json({ success: true, data: results });
    });
});

// 4. Mobile App: Get Sales History
app.get('/api/mobile/sales/:branchId', (req, res) => {
    const branchId = req.params.branchId;
    const sql = `SELECT * FROM sales_history WHERE branch_id = ? ORDER BY created_at DESC LIMIT 100`;
    
    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error." });
        
        const formattedData = results.map(sale => {
            let parsedItems = [];
            if (sale.items_json) {
                try {
                    parsedItems = typeof sale.items_json === 'string' ? JSON.parse(sale.items_json) : sale.items_json;
                } catch (e) {
                    parsedItems = [];
                }
            }
            return { ...sale, items_json: parsedItems };
        });

        res.json({ success: true, data: formattedData });
    });
});

// 5. Mobile App: Get Staff Members
app.get('/api/mobile/staff/:branchId', (req, res) => {
    const branchId = req.params.branchId;
    const sql = `SELECT id, full_name, username, role, telegram_id, card_id FROM staff WHERE branch_id = ?`;
    
    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error." });
        res.json({ success: true, staff: results });
    });
});

// 6. Mobile App: Get Categories
app.get('/api/mobile/categories/:branchId', (req, res) => {
    const branchId = req.params.branchId;
    const sql = `SELECT category_name FROM categories WHERE branch_id = ?`;
    
    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error." });
        const catList = results.map(row => row.category_name);
        res.json({ success: true, data: catList });
    });
});

// 7. Mobile App: Get Dashboard Stats (Today's Data)
app.get('/api/mobile/dashboard/stats/:branchId', (req, res) => {
    const branchId = req.params.branchId;
    
    // මේක ටිකක් සංකීර්ණ query එකක්. අද දවසේ විකුණුම් එකතුව හොයනවා.
    const sql = `
        SELECT 
            COUNT(id) as total_bills,
            SUM(net_total) as today_sales,
            SUM(discount_total) as today_discounts
        FROM sales_history 
        WHERE branch_id = ? AND DATE(created_at) = CURDATE()
    `;
    
    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error." });
        
        const stats = results[0] || { total_bills: 0, today_sales: 0, today_discounts: 0 };
        
        res.json({ 
            success: true, 
            data: {
                totalSales: stats.today_sales || 0,
                totalOrders: stats.total_bills || 0,
                // වෙනත් අවශ්‍ය දත්ත මෙතනට එකතු කරන්න පුළුවන්
            }
        });
    });
});
// ============================================================================

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT} (SMTP via Google Script)`));
