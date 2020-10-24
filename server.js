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
const LinkedInStrategy = require("passport-linkedin-oauth2").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;

const Twit = require("twit");
const cryptr = require("cryptr");
const fetch = require("node-fetch");
const OAuth = require("oauth");

// custom files

const blackPines = require("./blackpinesAuthentication");
const twitterAuth = require("./twitterAuthentication");
const linkedinAuth = require("./linkedinAuthentication");
const facebookAuth = require("./facebookAuthentication");
const platformSearch = require("./platformSearch");

const app = express();

app.set('view engine', 'html');
app.use(express.static(path.join(__dirname, 'dist/Blackpines')));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
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

const newCustomerSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: String,
    password: String,
    twitterCredentials: Object,
    twitterProfile: Object,
    linkedinCredentials: Object,
    linkedinProfile: Object,
    facebookCredentials: Object,
    facebookProfile: Object,
});

newCustomerSchema.plugin(passportLocalMongoose);

const Customer = new mongoose.model("Customer", newCustomerSchema);

/////////////////////////////////////////////////////////////////////////////////////////
//                               Authenticate Strategies                               //
/////////////////////////////////////////////////////////////////////////////////////////

passport.use(Customer.createStrategy());

passport.use(new TwitterStrategy({
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
    callbackURL: "http://localhost:3000/twitter/callback", // set to https://blackpines.herokuapp.com/twitter/callback when live
},  function(token, tokenSecret, profile, callback) {
        profile.token = token;
        profile.tokenSecret = tokenSecret;
        return callback(null, profile);
}));

passport.use(new LinkedInStrategy({
    clientID: process.env.LINKEDIN_CONSUMER_KEY,
    clientSecret: process.env.LINKEDIN_CONSUMER_SECRET,
    callbackURL: "http://localhost:3000/linkedin/callback",
},  function(accessToken, refreshToken, profile, callback) {
        profile.token = accessToken;
        profile.tokenSecret = refreshToken;
        return callback(null, profile);
}));

passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/facebook/callback",
},  function(accessToken, refreshToken, profile, callback) {
        profile.token = accessToken;
        profile.tokenSecret = refreshToken;
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

/////////////// API functions

// returns logged in user's account details to the front-end

app.get("/api/user", (req, res) => {
    res.send(req.user);
});

// returns user's twitter home timeline

app.get("/api/myfeed", (req, res) => {
    function callback(feed) {
        if(typeof feed === "string") {
            const result = {
                success: false,
                message: feed,
            }
            return res.send(result);
        }
        for(let post of feed) {
            let time = post.created_at.substr(4, 12);
            post.created_at = time;
        }
        res.send(feed)
    }
    twitterAuth.getFeed(req, callback);
})

// returns user's twitter posts

app.get("/api/myposts", (req, res) => {
    function callback(posts) {
        if(typeof posts[0] === "undefined") {
            const result = {
                success: false,
                message: "Unable to fetch your twitter statuses, please try again later",
            }
            return res.send(result);
        }
        for(let post of posts) {
            let time = post.created_at.substr(4, 12);
            post.created_at = time;
        }
        res.send(posts);
    }
    twitterAuth.getPosts(req, callback);
})

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
    check("searchTerm").stripLow().trim().escape(),
], (req, res) => {
    const searchTerm = req.body.searchTerm // the user's searched term
    let twitter = req.body.twitter; // if twitter is selected by user
    let linkedin = req.body.linkedin; // if linkedin is selected by user
    let facebook = req.body.facebook; // if facebook is selected by user
    const type = req.body.type; // if the user is searching for posts or users

    let failSafeCalled = false; // used to prevent the complete function from returning data if the failsafe is called after a timeout 

    // what will be returned to the client side
    let outcome = {
        twitter: {
            results: "",
            success: false,
        },
        linkedin: {
            results: "",
            success: false,
        },
        facebook: {
            results: "",
            success: false,
        }
    };
    
    // is a search query returns succesfully with data - this will be called
    function callbackSuccess(platform, results) {
        if(platform === "twitter") {
            outcome.twitter.results = results;
            outcome.twitter.success = true;
            twitter = false;
        }
        else if(platform === "linkedin") {
            outcome.linkedin.results = results;
            outcome.linkedin.success = true;
            linkedin = false;
            console.log("linkedin match")
        }
        else {
            outcome.facebook.results = results;
            outcome.facebook.success = true;
            facebook = false;
            console.log("facebook match")
        }
        // when a platform search request returns it will set the respective platform value to false in order to call the function back to the client side
        //      this is called in both the success callback & the failed callback as both will return a value to the client side
        if(!twitter && !linkedin && !facebook) complete();
    }

    // is a search query doesn't returns - this will be called
    function callbackFailed(platform, message) {
        if(platform === "twitter") {
            outcome.twitter.message = message;
            outcome.twitter.success = false;
            twitter = false;
        }
        else if(platform === "linkedin") {
            outcome.linkedin.message = message;
            outcome.linkedin.success = false;
            linkedin = false;
            console.log("linkedin match")
        }
        else {
            outcome.facebook.message = message;
            outcome.facebook.success = false;
            facebook = false;
            console.log("facebook match")
        }
        if(!twitter && !linkedin && !facebook) complete();
    }

    // this calls platform search requests depending on the user selected filter options
    if(twitter) {
        platformSearch.twitter(req, searchTerm, type, callbackSuccess, callbackFailed);
    }
    if(linkedin) platformSearch.linkedin(req, searchTerm, type, callbackSuccess, callbackFailed);
    if(facebook) platformSearch.facebook(req, searchTerm, type, callbackSuccess, callbackFailed);

    // request(s) takes too long
    const failsafe = setTimeout(() => {
        failSafeCalled = true;
        const end = {
            success: false,
            message: "Request timed out, please try searching again later",
        }
        return res.send(end);
    }, 30000); 

    // returns result(s) back to client side
    const complete = () => {
        console.log("complete func called");
        if(!failSafeCalled) {
            console.log(outcome);
            console.log("yeet");
            clearTimeout(failsafe);
            return res.send(outcome);
        }
    };

    // this will end the API call if none of the platforms are selected in the filter
    if(!twitter && !linkedin && !facebook) complete();
})

/////////////////////////////////////////////////////////////////////////////////////////
//                              Posting to Platforms                                   //
/////////////////////////////////////////////////////////////////////////////////////////

app.post("/newpost", [
    check("tweet").stripLow().trim().escape(),
    check("linkedin-post").stripLow().trim().escape(),
    check("facebook-post").stripLow().trim().escape(),
], (req, res) => {
    function callback(result) {
        res.send(result)
    }
    twitterAuth.newTweet(req, callback)
})

/////////////////////////////////////////////////////////////////////////////////////////
//                    Connecting & Disconnecting from platforms                        //
/////////////////////////////////////////////////////////////////////////////////////////

////////////// twitter
// connect

app.get("/twitter", checkAuthentication, passport.authorize("twitter"));

app.get("/twitter/callback", checkAuthentication, passport.authorize("twitter", {
    failureRedirect: "/failre",
}), function(req, res) {
    twitterAuth.callback(req, res, Customer);
    res.redirect("/my-account");
});

// disconnect

app.get("/api/twitter/disconnect", function(req, res) {
    function cb (accountConnected) {
        res.send(accountConnected)
    }
    twitterAuth.disconnect(req, res, Customer, cb);
})

////////////// linkedin
// connect

// disconnect

////////////// facebook
// connect

// disconnect

/////////////// Main/Info Page

app.get("/", (req, res) => {
    res.render(`${__dirname}/index.html`);
})

/////////////// Login/Register & new-post redirect

app.get("/entry", (req, res) => {
    if(req.isAuthenticated()) {
        res.redirect("/my-feed");
    }
    else {
        res.sendFile(path.join(__dirname + '/dist/Blackpines/index.html'), req.flash("password"));
    }
})

app.post("/my-feed", (req, res) => res.redirect("/my-feed"));

app.post("/my-account", (req, res) => res.redirect("/my-account"));

app.post("/new-post", (req, res) => res.redirect("/new-post"));

/////////////// Logout

app.get("/logout", (req, res) => {
    req.logOut();
    res.redirect("/my-feed");
})

/////////////// handles any unsupported node routing over to angular routing
app.get("/*", checkAuthentication, (req, res) => {
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

const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`Server running on port ${port}`));