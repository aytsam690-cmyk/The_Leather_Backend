const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const {
  getExpenses,
  getExpenseStats,
  createExpense,
  updateExpense,
  deleteExpense,
} = require('../controllers/expenseController');

router.use(protect);
router.use(admin);

router.route('/')
  .get(getExpenses)
  .post(createExpense);

router.get('/stats', getExpenseStats);

router.route('/:id')
  .put(updateExpense)
  .delete(deleteExpense);

module.exports = router;
