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
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (results.length === 0) return res.status(401).json({ success: false, message: 'User not found' });
        
        const user = results[0];
        if (user.password === password) {
            res.json({ success: true, user: user });
        } else {
            res.status(401).json({ success: false, message: 'Invalid password' });
        }
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT} (SMTP via Google Script)`));
