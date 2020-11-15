const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomId: String,
  from: {
    email: String,
    userId: String,
  },
  content: String,
},
{
  collection: 'Messages',
  timestamp: true,
});

module.exports = mongoose.model('Message', messageSchema);
