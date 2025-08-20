const express = require("express");
const passport = require("passport");
const GitHubStrategy = require("passport-github").Strategy;
const axios = require("axios");
const session = require("express-session");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(session({ secret: "secret", resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));
const upload = multer({ storage: multer.memoryStorage() });

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: "https://upload-stage.glitch.me/callback",
    },
    function (accessToken, refreshToken, profile, cb) {
      profile.accessToken = accessToken;
      return cb(null, profile);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

app.get("/auth/github", passport.authenticate("github"));

app.get(
  "/callback",
  passport.authenticate("github", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/dash");
  }
);

app.get("/logout", (req, res) => {
  req.logout();
  res.redirect("/");
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/signin.html");
});

app.get("/dash", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }
  res.sendFile(__dirname + "/dash.html");
});

app.post("/create-repo", upload.single("repo_file"), async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }

  const repoName = req.body.repo_name;
  const repoDescription = req.body.repo_description;
  const fileBuffer = req.file.buffer;
  const fileName = 'index.json';
  const username = req.user.username;
  const accessToken = req.user.accessToken;

  try {
    // Check if the repository already exists
    try {
      const existingRepo = await axios.get(
        `https://api.github.com/repos/${username}/${repoName}`,
        {
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (existingRepo.data) {
        throw new Error(`Repository '${repoName}' already exists.`);
      }
    } catch (error) {
      if (error.response && error.response.status !== 404) {
        throw error;
      }
    }

    // Create a new repository
    const createRepoResponse = await axios.post(
      "https://api.github.com/user/repos",
      {
        name: repoName,
        private: false,
        description: repoDescription,
      },
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    console.log("Repository created:", createRepoResponse.data);

    // Update the repository topics
    const updateTopicsResponse = await axios.put(
      `https://api.github.com/repos/${username}/${repoName}/topics`,
      {
        names: ["sumo-shapes-stage"],
      },
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/vnd.github.mercy-preview+json",
        },
      }
    );

    console.log("Topics updated:", updateTopicsResponse.data);

    // Create a file in the new repository
    const createFileResponse = await axios.put(
      `https://api.github.com/repos/${username}/${repoName}/contents/${fileName}`,
      {
        message: "initial commit",
        content: fileBuffer.toString("base64"),
      },
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    console.log("File created:", createFileResponse.data);

    // Respond with success page
    let success = require("fs").readFileSync("success.html", "utf8");
    success = success.replace("RepoName", repoName);
    success = success.replace(
      "RepoURL",
      `https://github.com/${username}/${repoName}`
    );
    res.send(success);
  } catch (error) {
    console.error(
      "Error creating repository:",
      error.response ? error.response.data : error.message
    );
    res
      .status(500)
      .send(
        "Error creating repository: " +
          (error.response ? error.response.data.message : error.message)
      );
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
