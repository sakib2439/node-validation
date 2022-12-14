const path = require('path')
const fs = require('fs')
// const https = require('https')

const express = require('express')
require('dotenv').config()

const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const session = require('express-session')
const MongoDBStore = require('connect-mongodb-session')(session)
const csrf = require('csurf')
const flash = require('connect-flash')
const multer = require('multer')

const helmet = require('helmet')
const compression = require('compression')
const morgan = require('morgan')

const errorController = require('./controllers/error')
const User = require('./models/user')

const MONGODB_URI = process.env.MONGODB_URI

const app = express()
const store = new MongoDBStore({
    uri: MONGODB_URI,
    collection: 'sessions',
})

const csrfProtection = csrf()

const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'images')
    },
    filename: (req, file, cb) => {
        cb(null, new Date().getTime().toString() + '-' + file.originalname)
    },
})

const fileFilter = (req, file, cb) => {
    if (
        file.mimetype === 'image/png' ||
        file.mimetype === 'image/jpg' ||
        file.mimetype === 'image/jpeg'
    ) {
        cb(null, true)
    } else {
        cb(null, false)
    }
}

app.set('view engine', 'ejs')
app.set('views', 'views')

const adminRoutes = require('./routes/admin')
const shopRoutes = require('./routes/shop')
const authRoutes = require('./routes/auth')

const accessLogStream = fs.createWriteStream(
    path.join(__dirname, 'access.log'),
    { flags: 'a' }
)

app.use(helmet())
app.use(compression())
app.use(morgan('combined', { stream: accessLogStream }))

// const privateKey = fs.readFileSync('secret.key')
// const certificate = fs.readFileSync('server.cert')

app.use(bodyParser.urlencoded({ extended: false }))
app.use(multer({ storage: fileStorage, fileFilter }).single('image'))

app.use(express.static(path.join(__dirname, 'public')))
app.use('/images', express.static(path.join(__dirname, 'images')))

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: store,
    })
)
app.use(csrfProtection)
app.use(flash())

app.use((req, res, next) => {
    res.locals.isAuthenticated = req.session.isLoggedIn
    res.locals.csrfToken = req.csrfToken()
    next()
})

app.use((req, res, next) => {
    // throw new Error('Sync Dummy')
    if (!req.session.user) {
        return next()
    }
    User.findById(req.session.user._id)
        .then(user => {
            // throw new Error('Sync Dummy')
            if (!user) {
                return next()
            }
            req.user = user
            next()
        })
        .catch(err => {
            next(new Error(err))
        })
})

app.use('/admin', adminRoutes)
app.use(shopRoutes)
app.use(authRoutes)

app.use('/500', errorController.get500)
app.use(errorController.get404)
app.use((error, req, res, next) => {
    // res.status(error.httpStatusCode).render(...);
    // res.redirect('/500')
    console.log('server error => ', error)
    res.status(500).render('500', {
        pageTitle: 'Error!',
        path: '/500',
        errorMessage: error.message,
        isAuthenticated: req.session.isLoggedIn,
    })
})

mongoose
    .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(result => {
        let port = process.env.PORT
        // https
        //     .createServer({ key: privateKey, cert: certificate }, app)
        //     .listen(port, () => {
        //         console.log(`...Listening on port ${port}`)
        //     })
        app.listen(port, () => {
            console.log(`...Listening on port ${port}`)
        })
    })
    .catch(err => {
        console.log(err)
    })
