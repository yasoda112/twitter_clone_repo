const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();

app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3005, () => {
      console.log("Server Running at http://localhost:3005/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = "${username}"`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length >= 6) {
      const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
          
        )`;
      const dbResponse = await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(dbUser, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get(
  "/user/tweets/feed/",
  authenticateToken,
  async (request, response) => {}
);

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;

  const getFollowingUsersQuery = `
       SELECT
           name 
       FROM 
           user INNER JOIN follower
       ON user.user_id = follower.following_user_id;
       WHERE 
          follower.follower_user_id = ${user_id};
       `;
  const dbResponse = await db.all(getFollowingUsersQuery);
  response.send(dbResponse);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getFollowersUsersQuery = `
       SELECT 
          name
       FROM  
          user INNER JOIN follower
       ON user.user_id = follower.follower_user_id
       WHERE 
          follower.following_user_id = ${user_id};
       ;
    `;
  const dbResponse = await db.all(getFollowersUsersQuery);
  response.send(dbResponse);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
  const tweetsResult = await db.get(getTweetQuery);

  const userFollowersQuery = `
       SELECT
           * 
       FROM 
           user INNER JOIN follower
       ON user.user_id = follower.following_user_id;
       WHERE 
          follower.follower_user_id = ${user_id};
       `;
  const userFollowers = await db.all(userFollowersQuery);

  if (
    userFollowers.some(
      (item) => (item.following_user_id = tweetsResult.user_id)
    )
  ) {
    const getTweetDetailsQuery = `
        SELECT 
           tweet,COUNT(DISTINCT(like.like_id)) as likes,
           COUNT(DISTINCT(reply.reply_id)) as replies,
           tweet.date_time as dateTime
        FROM 
           tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id   
        WHERE 
            tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userFollowers[0].user_id};
     `;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getLikedUsersQuery = `
      SELECT 
        * 
      FROM
         follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
         INNER JOIN user ON user.user_id = like.user_id
      
      WHERE 
         tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};
   `;
    const likedUsers = await db.all(getTweetQuery);

    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          lies.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;

    const getRepliedUsersQuery = `
      SELECT * FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
      INNER JOIN reply ON reply.tweet_id = tweet.tweet_id INNER JOIN user ON 
       user.user_id = reply_user_id
      
      WHERE 
         tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};
   `;
    const repliedUsers = await db.get(getRepliedUsersQuery);

    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;

  const getAllTweetsQuery = `
     SELECT tweet.tweet as tweet , COUNT(DISTINCT(like_id)) as likes,COUNT(DISTINCT(reply_id)) as replies,  tweet.date_time as dateTime
     FROM user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
     WHERE 
         user.user_id = ${user_id}
     GROUP BY 
         tweet.tweet_id    
     ;
   
  `;

  const dbResponse = await db.all(getAllTweetsQuery);
  response.send(dbResponse);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;

  const addTweetQuery = `
    INSERT INTO tweet(tweet,user_id)
    VALUES("${tweet}",${user_id});
`;
  const dbResponse = await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;

    const selectUserQuery = `SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId}`;
    const tweetUser = await db.all(selectUserQuery);

    if (tweetUser.length !== 0) {
      const deleteTweetQuery = `DELETE  FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId}`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
