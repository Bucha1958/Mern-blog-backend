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

// Middleware for handling file uploads
const uploadMiddleware = multer({ dest: 'uploads/' })

// Constants
const salt = bcrypt.genSaltSync(10);
const secret = process.env.SECRET_KEY;

// Middleware setup
app.use(cors({credentials:true, origin:'https://stanblog.netlify.app'}));
app.use(express.json());
app.use(cookieParser())
app.use('/uploads', express.static(__dirname + '/uploads'));

// Database connection
const url = process.env.DATABASE_URL;
mongoose.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Error connecting to MongoDB: ' + err);
});

// Root endpoint
app.get('/', (req, res) => {
    res.send('My app is successfully deployed on Render!');
});

// User registration endpoint
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

// User login endpoint
app.post('/login', async (req, res) => {
    const {username, password} = req.body;
    const userDoc = await UserModal.findOne({username})
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
        // Generate JWT token and set it in a cookie
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

// User logout endpoint
app.post('/logout', (req, res) => {
    res.cookie('token', '').json('ok');
})

// User profile endpoint
app.get('/profile', (req, res) => {
    const {token} = req.cookies
    jwt.verify(token, secret, {}, (err, info) => {
        if (err) throw err;
        res.json(info);
    })
})

// Post creation endpoint
app.post('/post', uploadMiddleware.single('file'), async (req, res) => {
    // Handling file upload and associating it with a post
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

// Post update endpoint
app.put('/post',uploadMiddleware.single('file'), async (req,res) => {
    let newPath = null;
    if (req.file) {
      const {originalname,path} = req.file;
      const parts = originalname.split('.');
      const ext = parts[parts.length - 1];
      newPath = path+'.'+ext;
      fs.renameSync(path, newPath);
    }
  
    const {token} = req.cookies;
    jwt.verify(token, secret, {}, async (err,info) => {
      if (err) throw err;
      const {id,title,summary,content} = req.body;
      const postDoc = await Post.findById(id);
      const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
      if (!isAuthor) {
        return res.status(400).json('you are not the author');
      }
      await postDoc.update({
        title,
        summary,
        content,
        cover: newPath ? newPath : postDoc.cover,
      });
  
      res.json(postDoc);
    });
  
});

// Get all posts endpoint
app.get('/post', async (req, res) => {
    const posts = await PostModal.find()
        .populate('author', ['username'])
        .sort({createdAt: -1})
        .limit(20);
    res.json(posts);
})

// Get a specific post by ID endpoint
app.get('/post/:id', async (req, res) => {
    const { id } = req.params
    const postId = await PostModal.findById(id).populate('author', ['username']);
    res.json(postId);
})

// Server setup
const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
