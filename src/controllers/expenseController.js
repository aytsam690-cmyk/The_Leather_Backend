const asyncHandler = require('express-async-handler');
const Expense = require('../models/Expense');

// @desc    Get all expenses with filtering & pagination
// @route   GET /api/expenses
// @access  Private/Admin
const getExpenses = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const { search, category, startDate, endDate } = req.query;

  const filter = {};

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { notes: { $regex: search, $options: 'i' } },
    ];
  }

  if (category && category !== 'All') {
    filter.category = category;
  }

  if (startDate || endDate) {
    filter.date = {};
    if (startDate) {
      filter.date.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }

  const count = await Expense.countDocuments(filter);
  const expenses = await Expense.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .skip(limit * (page - 1))
    .limit(limit)
    .populate('createdBy', 'name email')
    .lean();

  res.json({
    expenses,
    page,
    pages: Math.ceil(count / limit) || 1,
    total: count,
  });
});

// @desc    Get expense analytics & summary stats
// @route   GET /api/expenses/stats
// @access  Private/Admin
const getExpenseStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Total All Time
  const totalAllTimeAgg = await Expense.aggregate([
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);
  const totalAllTime = totalAllTimeAgg[0]?.total || 0;
  const totalCount = totalAllTimeAgg[0]?.count || 0;

  // Total This Month
  const totalMonthAgg = await Expense.aggregate([
    { $match: { date: { $gte: startOfMonth, $lte: endOfMonth } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalThisMonth = totalMonthAgg[0]?.total || 0;

  // Category Breakdown
  const categoryBreakdown = await Expense.aggregate([
    { $group: { _id: '$category', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $sort: { totalAmount: -1 } }
  ]);

  res.json({
    totalAllTime,
    totalThisMonth,
    totalCount,
    categoryBreakdown: categoryBreakdown.map(c => ({
      category: c._id,
      totalAmount: c.totalAmount,
      count: c.count,
    })),
  });
});

// @desc    Create new expense (supports single or batch array)
// @route   POST /api/expenses
// @access  Private/Admin
const createExpense = asyncHandler(async (req, res) => {
  const { title, category, amount, date, paymentMethod, notes } = req.body;

  if (!title || amount === undefined || amount === null) {
    res.status(400);
    throw new Error('Please provide both title and amount for the expense');
  }

  const expense = await Expense.create({
    title,
    category: category || 'Miscellaneous',
    amount: Number(amount),
    date: date ? new Date(date) : new Date(),
    paymentMethod: paymentMethod || 'Cash',
    notes: notes || '',
    createdBy: req.user?._id,
  });

  res.status(201).json(expense);
});

// @desc    Update an expense
// @route   PUT /api/expenses/:id
// @access  Private/Admin
const updateExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);

  if (!expense) {
    res.status(404);
    throw new Error('Expense not found');
  }

  const { title, category, amount, date, paymentMethod, notes } = req.body;

  if (title !== undefined) expense.title = title;
  if (category !== undefined) expense.category = category;
  if (amount !== undefined) expense.amount = Number(amount);
  if (date !== undefined) expense.date = new Date(date);
  if (paymentMethod !== undefined) expense.paymentMethod = paymentMethod;
  if (notes !== undefined) expense.notes = notes;

  const updatedExpense = await expense.save();
  res.json(updatedExpense);
});

// @desc    Delete an expense
// @route   DELETE /api/expenses/:id
// @access  Private/Admin
const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);

  if (!expense) {
    res.status(404);
    throw new Error('Expense not found');
  }

  await expense.deleteOne();
  res.json({ message: 'Expense deleted successfully', id: req.params.id });
});

module.exports = {
  getExpenses,
  getExpenseStats,
  createExpense,
  updateExpense,
  deleteExpense,
};
