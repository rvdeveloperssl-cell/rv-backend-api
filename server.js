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

// --- OTP යවන API එක (Google Script එකට Connect කළා) ---
app.post('/api/send-otp', async (req, res) => {
    const { email, otp } = req.body;
    
    // ඔයාගේ Google Script URL එක මෙතනට දාන්න
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxDBtNzkGL685gbIA6foL6FyD-JE7usPQ32mtw1_QuM4KZo_GkZvsXSvA3pQzc41psHXA/exec';

    try {
        // අපි Google Script එකට POST Request එකක් යවනවා Email එක සහ OTP එක එක්ක
        const response = await axios.post(GOOGLE_SCRIPT_URL, {
            email: email,
            otp: otp
        });

        // Google Script එක "Success" කියලා එවුවොත් විතරක් Frontend එකට Success යවනවා
        if (response.data === "Success") {
            res.status(200).json({ success: true, message: 'OTP sent successfully via Google Script!' });
        } else {
            console.error("Script Error Response:", response.data);
            res.status(500).json({ success: false, message: 'Google Script failed to send email.' });
        }
    } catch (error) {
        console.error("Axios Error:", error.message);
        res.status(500).json({ success: false, message: 'Could not connect to Google Script.' });
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

// Register API
app.post('/api/register', (req, res) => {
    const { fullName, email, phone, nic, address, companyName, password } = req.body;
    const id = 'user_' + Date.now();

    const query = `INSERT INTO users (id, fullName, email, phone, nic, address, companyName, password, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'client')`;
    
    db.query(query, [id, fullName, email, phone, nic, address, companyName, password], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: 'User registered successfully!' });
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
    const query = `SELECT * FROM software ORDER BY name ASC`;
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

// 3. එක සොෆ්ට්වෙයාර් එකක් ID එකෙන් ගන්න එක (මේක අන්තිමට තියෙන්න ඕනේ)
app.get('/api/software/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM software WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: "Not found" });
        res.json(results[0]);
    });
});

// 4. Add New Software
app.post('/api/software', (req, res) => {
    // Firebase වලට අදාළ 'requiresFirebase' මෙතනින් අයින් කළා
    const { 
        name, description, price, version, category, 
        imageUrl, systemRequirements, isFree, downloadUrl, 
        mobileAppUrl, extraLink, features 
    } = req.body;

    // Database එකේ තියෙන columns 12 ට ගැලපෙන SQL එක
    const query = `INSERT INTO software 
    (name, description, price, version, category, imageUrl, systemRequirements, isFree, downloadUrl, mobileAppUrl, extraLink, features, downloadCount) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`;

    // Features ටික array එකක් විදිහට ආවොත් ඒක string එකක් කරලා සේව් කරනවා
    const featuresData = Array.isArray(features) ? JSON.stringify(features) : features;

    db.query(query, [
        name, description, price, version, category, 
        imageUrl, systemRequirements, isFree ? 1 : 0, 
        downloadUrl, mobileAppUrl, extraLink, featuresData
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
        name, description, price, version, category, 
        imageUrl, systemRequirements, isFree, downloadUrl, 
        mobileAppUrl, extraLink, features 
    } = req.body;

    const query = `UPDATE software SET 
    name=?, description=?, price=?, version=?, category=?, 
    imageUrl=?, systemRequirements=?, isFree=?, downloadUrl=?, 
    mobileAppUrl=?, extraLink=?, features=? 
    WHERE id=?`;

    const featuresData = Array.isArray(features) ? JSON.stringify(features) : features;

    db.query(query, [
        name, description, price, version, category, 
        imageUrl, systemRequirements, isFree ? 1 : 0, 
        downloadUrl, mobileAppUrl, extraLink, featuresData, id
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

    // 4. User ගේ fullName එක සහ Software එකේ price එක ලබා ගැනීම
    const dataQuery = `
        SELECT u.fullName, s.price 
        FROM users u, software s 
        WHERE u.id = ? AND s.id = ?`;

    db.query(dataQuery, [userId, softwareId], (err, results) => {
        if (err || results.length === 0) {
            console.error("❌ DB Error or No results:", err);
            return res.status(500).json({ success: false, message: 'User or Software not found' });
        }

        const fullName = results[0].fullName;
        const amount = results[0].price;

        // 5. Purchases table එකට දත්ත ඇතුළත් කිරීම
        // මෙහිදී අපි purchaseId එකම Primary ID එක ලෙස පාවිච්චි කරනවා
        const query = `INSERT INTO purchases 
            (id, userId, fullName, softwareId, amount, paymentMethod, paymentStatus, slipUrl, createdAt) 
            VALUES (?, ?, ?, ?, ?, 'bank_transfer', 'pending', ?, NOW())`;

        db.query(query, [purchaseId, userId, fullName, softwareId, amount, slipUrl], (err, result) => {
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
app.post('/api/admin/verify-payment/:id', (req, res) => {
    const purchaseId = req.params.id;
    const { adminId } = req.body;

    console.log("Verifying Purchase:", purchaseId, "By Admin:", adminId);

    // 1. මුලින්ම පරණ Purchase එකේ දත්ත (userId, softwareId) හොයාගන්නවා
    const getPurchaseData = `SELECT userId, softwareId FROM purchases WHERE id = ?`;

    db.query(getPurchaseData, [purchaseId], (err, rows) => {
        if (err || rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase not found' });
        }

        const { userId, softwareId } = rows[0];

        // 2. License Key එක හදනවා
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const part1 = Array(5).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
        const part2 = Array(5).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
        const finalKey = `RVQ-${part1}-${part2}`;

        // 3. Expiry Date එක හදනවා (අද සිට වසර 1ක් ඉදිරියට)
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        const formattedExpiry = expiryDate.toISOString().slice(0, 19).replace('T', ' '); 

        const licenseId = 'lic_' + Date.now();

        // 4. මුලින්ම License එක සේව් කරනවා
        const insertLicense = `INSERT INTO licenses 
            (id, softwareId, userId, licenseKey, status, createdAt, expiresAt, maxActivations, currentActivations) 
            VALUES (?, ?, ?, ?, 'active', NOW(), ?, 1, 0)`;

        db.query(insertLicense, [licenseId, softwareId, userId, finalKey, formattedExpiry], (err) => {
            if (err) {
                console.error("❌ License Save Error:", err.message);
                return res.status(500).json({ success: false, message: 'Failed to generate license' });
            }

            // 5. දැන් Purchase එක Update කරනවා - මෙතනදී අපි licenseId එකත් සේව් කරනවා
            // ඔබේ purchases table එකේ licenseId නමින් column එකක් තිබිය යුතුය.
            const updatePurchase = `UPDATE purchases SET paymentStatus = 'verified', verifiedAt = NOW(), verifiedBy = ?, licenseId = ? WHERE id = ?`;

            db.query(updatePurchase, [adminId, licenseId, purchaseId], (err) => {
                if (err) {
                    console.error("❌ Purchase Update Error:", err.message);
                    return res.status(500).json({ success: false, message: 'Update error' });
                }

                res.json({ 
                    success: true, 
                    message: 'Payment verified and License generated!',
                    licenseKey: finalKey 
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

// --- CLIENT DASHBOARD API FIXES ---

// 1. User ගේ සියලුම Licenses (Software) ලබා ගැනීම
app.get('/api/licenses/user/:userId', (req, res) => {
    const { userId } = req.params;
    
    // මෙතනදී අපි 'licenses' ටේබල් එක 'software' ටේබල් එක සමඟ JOIN කරනවා
    // එවිට පරණ විදිහටම softwareName සහ description ලැබෙන අතරම, 
    // අලුතින් licenseKey, expiresAt, සහ activations දත්තත් ලැබේ.
    const query = `
        SELECT 
            l.*, 
            s.name as softwareName, 
            s.description,
            s.imageUrl
        FROM licenses l
        JOIN software s ON l.softwareId = s.id 
        WHERE l.userId = ? AND l.status = 'active'
        ORDER BY l.createdAt DESC`;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error("❌ Fetch Licenses Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        
        // Frontend එකට සියලුම දත්ත (License Key, Expiry, etc.) සහිත array එක යවයි
        res.json(results);
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
            companyName, 
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT} (SMTP via Google Script)`));
