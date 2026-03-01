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

// 1. Get All Software
app.get('/api/software', (req, res) => {
    db.query('SELECT * FROM software ORDER BY createdAt DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Add New Software
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

// 3. Update Software
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

// 4. Delete Software
app.delete('/api/software/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM software WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Get Single Software by ID
app.get('/api/software/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM software WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: "Not found" });
        res.json(results[0]);
    });
});

// --- RV DEVELOPERS PAYMENT SYSTEM (FIXED FOR IMGBB & FULL NAME) ---

// 1. Bank Slip URL එක සහ Purchase එකක් create කිරීම
// මෙතන දැන් upload.single('slip') අවශ්‍ය නැත, මොකද එන්නේ string URL එකක් නිසා
app.post('/api/payments/bank-transfer', (req, res) => {
    // Frontend එකෙන් දැන් slipUrl එකත් body එකේම එවනවා
    const { userId, softwareId, slipUrl } = req.body; 
    const purchaseId = 'pur_' + Date.now();

    // User ගේ නම සහ Software එකේ price එක එකවර ලබා ගනිමු
    const dataQuery = `
        SELECT u.fullName, s.price 
        FROM users u, software s 
        WHERE u.id = ? AND s.id = ?`;

    db.query(dataQuery, [userId, softwareId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ success: false, message: 'User or Software not found' });
        }

        const fullName = results[0].fullName;
        const amount = results[0].price;

        // දැන් fullName එකත් එක්කම Insert කරනවා, එතකොට කවදාවත් Unknown වෙන්නේ නැහැ
        const query = `INSERT INTO purchases (id, userId, fullName, softwareId, amount, paymentMethod, paymentStatus, slipUrl, createdAt) 
                      VALUES (?, ?, ?, ?, ?, 'bank_transfer', 'pending', ?, NOW())`;

        db.query(query, [purchaseId, userId, fullName, softwareId, amount, slipUrl], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, message: 'Slip submitted successfully!', purchaseId });
        });
    });
});

// 2. Admin ට පෙන්වන්න සියලුම පූජාවන් (Unknown ප්‍රශ්නය මෙතනින් සම්පූර්ණයෙන්ම ඉවරයි)
app.get('/api/admin/purchases/all', (req, res) => {
    // අපි කලින්ම fullName එක save කරපු නිසා JOIN අවශ්‍ය නැහැ, ඒත් අමතර ආරක්ෂාවට LEFT JOIN එකක් තියමු
    const query = `
        SELECT p.*, s.name as softwareName 
        FROM purchases p 
        LEFT JOIN software s ON p.softwareId = s.id 
        ORDER BY p.createdAt DESC`;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 3. Admin payment එක verify කිරීම
app.post('/api/admin/verify-payment/:id', (req, res) => {
    const { id } = req.params;
    const { adminId } = req.body;
    
    const query = `UPDATE purchases SET paymentStatus = 'verified', verifiedAt = NOW(), verifiedBy = ? WHERE id = ?`;

    db.query(query, [adminId, id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: 'Payment verified!' });
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT} (SMTP via Google Script)`));
