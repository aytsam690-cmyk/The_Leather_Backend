const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Expense title is required'],
    trim: true,
  },
  category: {
    type: String,
    required: [true, 'Expense category is required'],
    enum: [
      'Materials & Supplies',
      'Shipping & Courier',
      'Marketing & Ads',
      'Salaries & Wages',
      'Rent & Utilities',
      'Software & Tools',
      'Miscellaneous'
    ],
    default: 'Miscellaneous',
  },
  amount: {
    type: Number,
    required: [true, 'Expense amount is required'],
    min: [0, 'Amount must be greater than or equal to 0'],
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Credit/Debit Card', 'Easypaisa/JazzCash', 'Other'],
    default: 'Cash',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });

const Expense = mongoose.model('Expense', expenseSchema);
module.exports = Expense;
