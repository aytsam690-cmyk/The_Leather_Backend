const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const mongoose = require('mongoose');

const Category = require('../models/Category');

const getFilters = asyncHandler(async (req, res) => {
  const { category } = req.query;

  const matchStage = { isActive: true };
  if (category) {
    if (mongoose.isValidObjectId(category)) {
      matchStage.category = new mongoose.Types.ObjectId(category);
    } else {
      const cat = await Category.findOne({ name: category });
      if (cat) {
        matchStage.category = cat._id;
      } else {
        matchStage.category = null;
      }
    }
  }

  const aggregation = await Product.aggregate([
    { $match: matchStage },
    { $unwind: { path: '$variants', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
        minPrice: { $min: { $min: ['$price', '$variants.price'] } },
        maxPrice: { $max: { $max: ['$price', '$variants.price'] } },
        brands: { $addToSet: '$brand' },
        sizes: { $addToSet: '$variants.size' },
        colors: { $addToSet: '$variants.color' }
      }
    },
    {
      $project: {
        _id: 0,
        minPrice: 1,
        maxPrice: 1,
        brands: { $filter: { input: '$brands', as: 'brand', cond: { $ne: ['$$brand', null] } } },
        sizes: { $filter: { input: '$sizes', as: 'size', cond: { $ne: ['$$size', null] } } },
        colors: { $filter: { input: '$colors', as: 'color', cond: { $ne: ['$$color', null] } } }
      }
    }
  ]);

  if (aggregation.length === 0) {
    return res.json({
      minPrice: 0,
      maxPrice: 0,
      brands: [],
      sizes: [],
      colors: []
    });
  }

  res.json(aggregation[0]);
});

module.exports = {
  getFilters
};
