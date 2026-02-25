const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const nodemailer = require('nodemailer'); // Nodemailer එකතු කළා
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

// Nodemailer Transporter එක සකස් කිරීම
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// සරල පරීක්ෂණයක්
app.get('/', (req, res) => {
    res.send('RV Backend API is Running!');
});

// --- OTP යවන API එක (ඔයාගේ ලස්සන HTML එකත් එක්ක) ---
app.post('/api/send-otp', async (req, res) => {
    const { email, otp } = req.body;

    const htmlBody = `
      <html>
        <head>
          <style>
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
          </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f4f4;">
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 450px; margin: 20px auto; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e1e1e1; background-color: #ffffff; animation: slideUp 0.8s ease-out;">
            
            <div style="background: linear-gradient(135deg, #0056b3 0%, #003d7a 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase;">Security Verification</h1>
            </div>
            
            <div style="padding: 30px; text-align: center;">
              <p style="color: #444; font-size: 16px; margin-bottom: 25px;">Please use the following One-Time Password (OTP) to complete your verification process.</p>
              
              <div style="background-color: #f8f9fa; border: 2px dashed #0056b3; border-radius: 10px; padding: 25px; margin-bottom: 25px;">
                <span style="font-size: 42px; font-weight: bold; color: #0056b3; letter-spacing: 10px; display: inline-block;">${otp}</span>
              </div>
              
              <p style="color: #777; font-size: 13px; line-height: 1.6;">
                This code is valid for <b style="color: #d9534f;">10 minutes</b> only.<br>
                If you did not request this code, please ignore this email.
              </p>
            </div>
            
            <div style="background-color: #0b0e16; padding: 25px; text-align: center; border-top: 1px solid #e1e1e1;">
              <div style="margin-bottom: 5px;">
                <span style="color: #ffffff; font-weight: bold; font-size: 16px; letter-spacing: 1px; display: inline-block;">
                  🚀 <span style="color: #4F46E5;">RV</span> DEVELOPERS SL
                </span>
              </div>
              <p style="color: #6b7280; margin: 5px 0 0; font-size: 11px;">&copy; 2026 RV Developers. All rights reserved.</p>
              <div style="height: 3px; width: 50px; background: #4F46E5; margin: 10px auto; border-radius: 10px;"></div>
            </div>
          </div>
        </body>
      </html>
    `;

    const mailOptions = {
        from: `"RV Developers SL" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `OTP Verification Code - ${otp}`,
        html: htmlBody
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'OTP sent successfully!' });
    } catch (error) {
        console.error("Mail Error:", error);
        res.status(500).json({ success: false, message: 'Failed to send OTP.' });
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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
