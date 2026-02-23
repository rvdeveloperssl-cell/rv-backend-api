const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
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

// සරල පරීක්ෂණයක් (API එක වැඩද බලන්න)
app.get('/', (req, res) => {
    res.send('RV Backend API is Running!');
});
// Register API
app.post('/api/register', (req, res) => {
    const { fullName, email, phone, nic, address, companyName, password } = req.body;
    const id = 'user_' + Date.now(); // සරල ID එකක්

    const query = `INSERT INTO users (id, fullName, email, phone, nic, address, companyName, password, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'client')`;
    
    db.query(query, [id, fullName, email, phone, nic, address, companyName, password], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: 'User registered successfully!' });
    });
});


// Login API එක (මේක ඔයාගේ AuthContext එකෙන් පස්සේ පාවිච්චි කරනවා)
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (results.length === 0) return res.status(401).json({ success: false, message: 'User not found' });
        
        // මෙතනදී password එක check කරනවා (දැනට සරලව කරමු)
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
