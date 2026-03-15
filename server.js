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

// Slip save karanna folder ekak hadanawa
const uploadDir = 'uploads/slips';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'slip-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });
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
    const { licenseKey, branchName } = req.body;

    if (!licenseKey || !branchName) {
        return res.status(400).json({ success: false, message: "Missing License Key or Branch Name" });
    }

    // ලයිසන් එක පරීක්ෂා කිරීම (Status එක active විය යුතු අතර activations ඉතිරිව තිබිය යුතුය)
    const sql = `SELECT * FROM licenses WHERE licenseKey = ? AND status = 'active'`;

    db.query(sql, [licenseKey], (err, results) => {
        if (err) {
            console.error("❌ SQL Error (Verify):", err.message);
            return res.status(500).json({ success: false, message: "Internal Server Error" });
        }

        if (results.length > 0) {
            const license = results[0];

            // දැනට පාවිච්චි කර ඇති ප්‍රමාණය උපරිම ප්‍රමාණයට වඩා අඩුදැයි බැලීම
            if (license.currentActivations >= license.maxActivations) {
                return res.json({ success: false, message: "Activation Limit Reached! (උපරිම සීමාව ඉක්මවා ඇත)" });
            }

            // ලයිසන් එක වලංගුයි
            res.json({ 
                success: true, 
                message: "License Valid",
                userId: license.userId // මෙය Setup පියවරට අවශ්‍ය වේ
            });
        } else {
            res.json({ success: false, message: "Invalid, Blocked or Expired License Key!" });
        }
    });
});

// --- 2. BRANCH SETUP API ---
// POS එකේ දෙවැනි පියවරේදී (Step 2) සියලුම විස්තර branches ටේබල් එකට සේව් කිරීම
app.post('/api/setup-branch', (req, res) => {
    const { 
        licenseKey, 
        branchName, 
        businessName, 
        phone, 
        address, 
        botToken, 
        chatId,
        hwid // Frontend එකෙන් එවන HWID එක මෙතනට ගන්නවා
    } = req.body;

    console.log("🛠️ Setup attempt for license:", licenseKey, "on Branch:", branchName);

    // 1. ලයිසන් එකට අදාළ userId එක හොයාගන්නවා
    db.query('SELECT userId FROM licenses WHERE licenseKey = ?', [licenseKey], (err, results) => {
        if (err) {
            console.error("❌ Database Error (Lookup):", err);
            return res.status(500).json({ success: false, message: "Database lookup error" });
        }

        if (results.length === 0) {
            console.warn("⚠️ License Not Found:", licenseKey);
            return res.status(404).json({ success: false, message: "මෙම ලයිසන් එක පද්ධතියේ නැත." });
        }

        const userId = results[0].userId;

        // 2. Branch එක Insert කිරීම (hwid එකත් සමඟ)
        const insertSql = `INSERT INTO branches 
            (userId, licenseKey, business_name, branch_name, hwid, address, phone, telegram_bot_token, telegram_chat_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const values = [userId, licenseKey, businessName, branchName, hwid, address, phone, botToken, chatId];

        db.query(insertSql, values, (insErr, result) => {
            if (insErr) {
                console.error("❌ SQL Error (Insert):", insErr.message);
                return res.status(500).json({ success: false, message: "Branch setup failed: " + insErr.message });
            }

            // 3. ලයිසන් එකේ currentActivations ප්‍රමාණය 1 කින් වැඩි කිරීම
            db.query('UPDATE licenses SET currentActivations = currentActivations + 1 WHERE licenseKey = ?', [licenseKey], (updErr) => {
                if (updErr) console.error("❌ Could not update activation count:", updErr);
                
                console.log("✅ Setup Success for:", businessName);
                res.json({ 
                    success: true, 
                    message: "System activated and branch setup complete!", 
                    branchId: result.insertId 
                });
            });
        });
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

app.post('/api/login', (req, res) => {
    const { username, password, branchId } = req.body;

    // Password එක plain text විදියටම දැනට check කරන්නේ (ඔයා register කරපු විදියට)
    const sql = `SELECT full_name as name, username as user, role 
                 FROM staff 
                 WHERE username = ? AND password = ? AND branch_id = ?`;

    db.query(sql, [username, password, branchId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        if (results.length > 0) {
            res.json({ success: true, user: results[0] });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials" });
        }
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT} (SMTP via Google Script)`));
