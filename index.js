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
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
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

// Define Swagger options
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
        title: 'Rest API Documentation',
        version: '1.0.0',
        },
        components: {
            securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
            },
            },
        },
        security: [
            {
            bearerAuth: [],
            },
        ],
    },
    apis: [__filename], // Path to the files containing Swagger JSDoc comments
};

const specs = swaggerJsdoc(options);



// Serve Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Expose swagger JSON 
app.get('/api-docs/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

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



/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new user
 *     description: Create a new user with the provided username and password.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User registration successful
 *         content:
 *           application/json:
 *             example:
 *               _id: "someUserId"
 *               username: "someUsername"
 */

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

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Log in an existing user
 *     description: Authenticate an existing user based on the provided username and password.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User login successful
 *         content:
 *           application/json:
 *             example:
 *               id: "someUserId"
 *               username: "someUsername"
 */

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

/**
 * @swagger
 * /post:
 *   post:
 *     summary: Create a new post
 *     description: Create a new post with title, summary, content, and an optional file upload.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               summary:
 *                 type: string
 *               content:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Post creation successful
 *         content:
 *           application/json:
 *             example:
 *               _id: "somePostId"
 *               title: "Sample Post"
 *               summary: "This is a sample post"
 *               author: "someUserId"
 */

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

/**
 * @swagger
 * /post:
 *   get:
 *     summary: Get a list of posts
 *     description: Retrieve a list of posts with details.
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             example:
 *               - title: "Sample Post"
 *                 summary: "This is a sample post"
 *                 author: { username: "sample_user" }
 */

// Get all posts endpoint
app.get('/post', async (req, res) => {
    const posts = await PostModal.find()
        .populate('author', ['username'])
        .sort({createdAt: -1})
        .limit(20);
    res.json(posts);
})

/**
 * @swagger
 * /post/{id}:
 *   get:
 *     summary: Get a specific post by ID
 *     description: Retrieve details of a post based on its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the post
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             example:
 *               _id: "somePostId"
 *               title: "Sample Post"
 *               summary: "This is a sample post"
 *               author: { username: "sample_user" }
 */

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
