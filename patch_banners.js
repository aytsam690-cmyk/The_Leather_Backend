const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://aytsam690_db_user:QT9WMJqI7JzhCI5b@cluster0.dftd3ge.mongodb.net/shopverse')
  .then(() => mongoose.connection.collection('banners').updateMany({ position: { $exists: false } }, { $set: { position: 'Home Hero' } }))
  .then(res => { console.log(res); process.exit(0); })
  .catch(console.error);
