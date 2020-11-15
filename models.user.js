const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  roomIds: [
    {
      type: String,
    },
  ],
  password: String,
  email: String,
},
{
  collection: 'Users',
  timestamp: true,
});

module.exports = mongoose.model('User', userSchema);
