require('dotenv/config');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const User = require('./models.user');

const WSS = require('./services.ws');

const app = express();
app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URL, (err) => {
  if (err) {
    process.stdout.write(`Cannot connect to mongodb: ${err.toString()}`);
    return process.exit(1);
  }

  return new WSS();
});

app.post('/users/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.json({
      success: false,
      message: 'missing required fields',
    });
  }

  const newUser = new User({
    username, password, email, roomIds: [],
  });
  await newUser.save();

  return res.json({
    success: true,
    message: 'user created',
  });
});

const port = process.env.PORT || 4000;

app.listen(port, () => {
  process.stdout.write(`API server is online at port ${port}\n`);
});
