const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const UserModal = require('./models/User');
const PostModal = require('./models/Post');
const app = express();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer  = require('multer');
const fs = require('fs');
require('dotenv').config();


const uploadMiddleware = multer({ dest: 'uploads/' })


const salt = bcrypt.genSaltSync(10);
const secret = process.env.SECRET_KEY;

app.use(cors({credentials:true, origin:'http://localhost:5173'}));
app.use(express.json());
app.use(cookieParser())
app.use('/uploads', express.static(__dirname + '/uploads'));

const url = process.env.DATABASE_URL;
mongoose.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Error connecting to MongoDB: ' + err);
});

app.post('/register', async (req, res) => {

    const {username, password} = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10)
        const userDoc = await UserModal.create({username, password: hashedPassword})
        res.json(userDoc);
    } catch (e) {
        res.status(400).json(e);
    }
});

app.post('/login', async (req, res) => {
    const {username, password} = req.body;
    const userDoc = await UserModal.findOne({username})
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
        // logged in
        jwt.sign({username, id:userDoc._id}, secret, {}, (err, token) => {
            if (err) throw err;
            res.cookie('token', token).json({
                id:userDoc._id,
                username,
            });
        });
    } else {
        res.status(400).json('wrong credentials')
    }
})

app.post('/logout', (req, res) => {
    res.cookie('token', '').json('ok');
    
})

app.get('/profile', (req, res) => {
    const {token} = req.cookies
    jwt.verify(token, secret, {}, (err, info) => {
        if (err) throw err;
        res.json(info);
    })
})

app.post('/post', uploadMiddleware.single('file'), async (req, res) => {
    const {originalname, path} = req.file;
    const parts = originalname.split('.');
    const ext = parts[parts.length - 1];
    fs.renameSync(path, `${path}.${ext}`);
    const {token} = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
        if (err) throw err;
        const {title, summary, content} = req.body;
        const postDoc = await PostModal.create({
            title,
            summary,
            content,
            cover: `${path}.${ext}`,
            author: info.id,
        });
        res.json(postDoc);
    });

})

app.get('/post', async (req, res) => {
    const posts = await PostModal.find()
        .populate('author', ['username'])
        .sort({createdAt: -1})
        .limit(20);
    res.json(posts);
})

app.get('/post/:id', async (req, res) => {
    const { id } = req.params
    const postId = await PostModal.findById(id).populate('author', ['username']);
    res.json(postId);
})

app.listen(4000);

