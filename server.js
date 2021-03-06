/////////////////////////////////////////////////////////////////////////////////////////
//                                       Modules                                       //
/////////////////////////////////////////////////////////////////////////////////////////

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { check } = require("express-validator");

const passport = require("passport");
const session = require("express-session");
const flash = require("connect-flash");
const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const TwitterStrategy = require("passport-twitter").Strategy;

// custom files

const blackPines = require("./blackpinesAuthentication");
const twitterAPI = require("./twitter");

const app = express();

app.set('view engine', 'html');
app.use(express.static(path.join(__dirname, 'dist/Blackpines')));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(express.json({limit: '700kb'}));
app.use(flash());

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {secure: false},
}));

app.use(passport.initialize());
app.use(passport.session());

/////////////////////////////////////////////////////////////////////////////////////////
//                                    Database                                         //
/////////////////////////////////////////////////////////////////////////////////////////

mongoose.connect(process.env.API_KEY, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set("useCreateIndex", true);
mongoose.set('useFindAndModify', false);

const newCustomerSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: String,
    password: String,
    twitter: Array,
    lastLogIn: String,
    createdAt: String,
    resetPasswordToken: String,
});

newCustomerSchema.plugin(passportLocalMongoose);

const Customer = new mongoose.model("Customer", newCustomerSchema);

/////////////////////////////////////////////////////////////////////////////////////////
//                               Authenticate Strategies                               //
/////////////////////////////////////////////////////////////////////////////////////////

passport.use(Customer.createStrategy());

const host = (process.env.PORT) ? "http://www.blackpines.co.uk" : "http://localhost:3000";

passport.use(new TwitterStrategy({
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
    callbackURL: `${host}/twitter/callback`,
},  function(token, tokenSecret, profile, callback) {
        profile.token = token;
        profile.tokenSecret = tokenSecret;
        return callback(null, profile);
}));

passport.serializeUser(function(user, callback) {
    callback(null, user);
})

passport.deserializeUser(function(obj, callback) {
    callback(null, obj);
})

/////////////////////////////////////////////////////////////////////////////////////////
//                                  Web Routing                                        //
/////////////////////////////////////////////////////////////////////////////////////////

function checkAuthentication(req, res, next) {
    if(req.isAuthenticated()) {
        return next();
    }
    else {
        res.redirect("/entry");
    }
}

app.all("/*", (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    next();
})

/////////////////////////////////////////////////////////////////////////////////////////
//                    Connecting & Disconnecting from platforms                        //
/////////////////////////////////////////////////////////////////////////////////////////

////////////// twitter
// connect

app.get("/twitter", checkAuthentication, passport.authorize("twitter"));

app.get("/twitter/callback", checkAuthentication, passport.authorize("twitter", { failureRedirect: '/my-account' }), function(req, res) { //failureRedirect is used to redirect the user if they reject the connection
    function cb(val) {
        let route = "";
        switch(val) {
            case 200:
                route = ""; // new account added - nothing to add to the URL
                break;
            case 400:
                let string = encodeURIComponent("account already exists");
                route = `?error=${string}`; // account already added
                break;
            case 450:
                string = encodeURIComponent("max accounts");
                route = `?error=${string}`; // max number of accounts added
                break;
            case 500:
                string = encodeURIComponent("server error");
                route = `?error=${string}`; // server error
                break;
            default:
                route = ""; // best not to add unnecessary errors/messages
                break;
        }
        res.redirect(`/my-account${route}`);
    }
    twitterAPI.callback(req, Customer, cb);
});

// disconnect

app.post("/api/twitter/account/disconnect", function(req, res) {
    function cb (accountRemoved) {
        res.send(accountRemoved);
    }
    twitterAPI.disconnect(req, Customer, cb);
})

/////////////////////////////////////////////////////////////////////////////////////////
//                                      Web Routes                                     //
/////////////////////////////////////////////////////////////////////////////////////////

/////////////// Main/Info Page

app.get("/", (req, res) => {
    res.render(`${__dirname}/index.html`);
})

app.get("/entry", (req, res) => {
    if(req.isAuthenticated()) {
        res.redirect("/my-feed");
    }
    else {
        res.sendFile(path.join(__dirname + '/dist/Blackpines/index.html'), req.flash("password"));
    }
})

// loads forgot password page
app.get("/forgot-password", (req, res) => {
    res.sendFile(path.join(__dirname + '/dist/Blackpines/index.html'));
})

// api request to send email
app.post("/forgot-password", (req, res) => {
    const cb = val => {
        res.send(val);
    }
    blackPines.forgotPassword(req, Customer, cb);
});

// loads reseting password page
app.get("/reset-password", (req, res) => {
    const now = Date.now();
    // if the current timestamp is greater than the time stamp passed or one of the queries is missing then redirect to /forgot-password
    if(req.query.ts < now || typeof req.query.tk === "undefined" || typeof req.query.ts === "undefined" || typeof req.query.un === "undefined" ) {
        return res.redirect("/forgot-password");
    }
    res.sendFile(path.join(__dirname + '/dist/Blackpines/index.html'));
})


// API request to reset password
app.post("/reset-password", [
    check("password").isLength({ min: 8 }).stripLow().trim().escape(),
], (req, res) => {
    const cb = val => {
        res.send(val);
    }
    blackPines.resetPassword(req, Customer, cb);
    //res.sendFile(path.join(__dirname + '/dist/Blackpines/index.html')); ==========================================================================================================
})

app.post("/my-feed", (req, res) => res.redirect("/my-feed"));

app.post("/my-account", (req, res) => res.redirect("/my-account"));

app.post("/new-post", (req, res) => res.redirect("/new-post"));

/////////////// Logout

app.get("/logout", (req, res) => {
    req.logOut();
    res.redirect("/entry");
})

///////////////////////////////////////////////////////////////////// Delete account

app.post("/delete-account", (req, res) => {
    const callback = success => {
        if(success) {
            res.redirect("/logout");
        }
        else {
            const error = encodeURIComponent("account not deleted");
            res.redirect(`/my-account?error=${error}`);
        }
    }
    blackPines.deleteAccount(req, Customer, callback);
})

////////////////////////////////////////////////////////////////////////////////////

/////////////// passes node routing over to angular routing

app.get("/my-feed", checkAuthentication, (req, res) => {
    res.sendFile(path.join(__dirname + '/dist/Blackpines/index.html'));
})

app.get("/new-post", checkAuthentication, (req, res) => {
    res.sendFile(path.join(__dirname + '/dist/Blackpines/index.html'));
})

app.get("/search", checkAuthentication, (req, res) => {
    res.sendFile(path.join(__dirname + '/dist/Blackpines/index.html'));
})

// loading my-account page or redirected after succesfully adding a new Twitter account
app.get("/my-account", checkAuthentication, (req, res) => {
    const query = req.query.error;
    res.sendFile(path.join(__dirname + '/dist/Blackpines/index.html'));
})

/////////////// Login Function

app.post("/login", [
    check("username").isEmail().normalizeEmail().stripLow().trim().escape(),
    check("password").stripLow().trim().escape()
], function(req, res, next) {
    blackPines.login(req, res, next, Customer);
});

/////////////// Register Function

app.post("/register", [
    check("firstName").stripLow().trim().escape(),
    check("lastName").stripLow().trim().escape(),
    check("username").isEmail().normalizeEmail().stripLow().trim().escape(),
    check("password").isLength({ min: 8 }).stripLow().trim().escape(),
], function(req, res) {
    blackPines.register(req, res, Customer);
})

/////////////// serve robots.txt for web crawlers

app.get("/robots.txt", (req, res) => {
    res.sendFile("/robots.txt");
})

/////////////////////////////////////////////////////////////////////////////////////////
//                                   API Requests                                      //
/////////////////////////////////////////////////////////////////////////////////////////

/////////////// returns logged in user's account details to the front-end

app.get("/api/user", (req, res) => {
    // filter out sensitive info that doesn't have a use on the front-end by deep cloning the req.user object
    let filteredUser = JSON.parse(JSON.stringify(req.user));
    if(filteredUser.twitter) {
        for(let twitterAccount of filteredUser.twitter) {
            twitterAccount.token = undefined;
            twitterAccount.tokenSecret = undefined;
        }
    }
    filteredUser.salt = undefined;
    filteredUser.hash = undefined;
    res.send(filteredUser);
});

app.post("/api/changePassword", [
    check("oldPassword").stripLow().trim().escape(),
    check("newPassword").isLength({ min: 8 }).stripLow().trim().escape(),
], (req, res) => {
    const cb = result => {
        res.send(result);
    }
    blackPines.changePassword(req, Customer, cb);
})

app.post("/api/search", [
    check("query").stripLow().trim().escape(),
], (req, res) => {
    const searchTerm = req.body.query // the user's searched term
    const type = req.body.type; // if the user is searching for posts or users

    let failSafeCalled = false; // used to prevent the complete function from returning data if the failsafe is called after a timeout 

    // what will be returned to the client side
    let response = {
        results: "",
        success: false,
    };
    
    // is a search query returns succesfully with data - this will be called
    function callbackSuccess(results) {
        response.results = results;
        response.success = true;
        // when a platform search request returns it will set the respective platform value to false in order to call the function back to the client side
        //      this is called in both the success callback & the failed callback as both will return a value to the client side
        complete();
    }

    // is a search query fails - this will be called
    function callbackFailed() {
        response.message = "Something went wrong, please try again later";
        response.success = false;
        complete();
    }

    if(type === "Tweets") {
        twitterAPI.searchTweets(req, searchTerm, callbackSuccess, callbackFailed);
    }
    else {
        twitterAPI.searchUsers(req, searchTerm, callbackSuccess, callbackFailed);
    }

    // request takes too long
    const failsafe = setTimeout(() => {
        failSafeCalled = true;
        const end = {
            success: false,
            message: "Request timed out, please try searching again later",
        }
        return res.send(end);
    }, 20000); 

    // returns result(s) back to client side
    const complete = () => {
        if(!failSafeCalled) {
            clearTimeout(failsafe);
            return res.send(response);
        }
    };
})

/////////////// Platform API calls

/////////////// api structure: /api/platform/item/actionOrItems

app.post("/api/twitter/tweet/like", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.like(req, cb)
})

app.post("/api/twitter/tweet/retweet", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.retweet(req, cb);
})

app.post("/api/twitter/tweet/reply", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.reply(req, cb);
})

app.post("/api/twitter/tweet/delete", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.deleteTweet(req, cb);
})

/////////////// get tweets 

app.post("/api/twitter/tweet/get", (req, res) => {
    const postId = req.body.postId;
    function cb (val) {
        res.send(val);
    }
    twitterAPI.getTweet(req, postId, cb);
})

/////////////// New tweet

app.post("/api/twitter/tweet/newtweet", (req, res) => {
    function callback(results) {
        res.send(results);
    }
    if(req.body.accounts.length > 0) {
        twitterAPI.newTweet(req, callback)
    }
    else {
        const message = {
            text: "Please select at least one account to tweet",
            success: false,
        }
        res.send(message);
    }
})

app.get("/api/twitter/account/get", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.getUser(req, cb);
})

app.post("/api/twitter/account/follow", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.follow(req, cb);
})

app.post("/api/twitter/account/unfollow", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.unfollow(req, cb);
})

app.get("/api/twitter/account/isFollowing", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.checkIfFollowing(req, cb);
})

app.get("/api/twitter/account/tweets", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.getUsersTweets(req, cb);
})

app.get("/api/twitter/account/followers", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.getUsersFollowers(req, cb);
})

app.get("/api/twitter/account/following", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.getUsersFollowing(req, cb);
})

app.post("/api/twitter/account/update", (req, res) => {
    const cb = val => res.send(val);
    twitterAPI.update(req, cb);
})

/////////////// returns user's twitter home timeline

app.get("/api/twitter/account/myfeed", (req, res) => {
    function cb(results) {
        for(let result of results) {
            if(result.success) {
                for(let post of result.feed) {
                    let time = post.created_at.substr(4, 12);
                    post.created_at = time;
                }
            }
        }
        res.send(results);
    }
    twitterAPI.getFeed(req, cb);
})

/////////////// returns user's twitter posts

app.get("/api/twitter/account/myposts", (req, res) => {
    function callback(feeds) {
        for(feed of feeds) {
            if(feed.success) {
                for(let post of feed.feed) {
                    let time = post.created_at.substr(4, 12);
                    post.created_at = time;
                }
            }
        }
        res.send(feeds);
    }
    twitterAPI.getPosts(req, callback);
})

/////////////////////////////////////////////////////////////////////////////////////////
//                                      404                                            //
/////////////////////////////////////////////////////////////////////////////////////////

app.all("*", (req, res) => {
    res.sendFile(path.join(__dirname + '/dist/Blackpines/index.html'));
})

/////////////////////////////////////////////////////////////////////////////////////////
//                              Serving the application                                //
/////////////////////////////////////////////////////////////////////////////////////////

const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`Server running on port ${port}`));