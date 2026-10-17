const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Class = require('../models/Class');

const router = express.Router();






router.post('/classes', async (req, res) => {
  try {
    const { className, division } = req.body;

    if (!className || !division) {
      return res.status(400).json({ message: 'Both className and division are required.' });
    }

    const trimmedClassName = className.trim().toUpperCase();
    const trimmedDivision = division.trim().toUpperCase();

    
    const existing = await Class.findOne({
      className: trimmedClassName,
      division: trimmedDivision
    });

    if (existing) {
      return res.status(400).json({ message: 'Class and division pair already exists.' });
    }

    const newClass = await Class.create({
      className: trimmedClassName,
      division: trimmedDivision
    });

    return res.status(201).json(newClass);
  } catch (error) {
    console.error('Create class error:', error);
    return res.status(500).json({ message: 'Error creating class.' });
  }
});


router.get('/classes', async (req, res) => {
  try {
    const classes = await Class.find().sort({ className: 1, division: 1 });
    return res.status(200).json(classes);
  } catch (error) {
    console.error('List classes error:', error);
    return res.status(500).json({ message: 'Error fetching classes.' });
  }
});






router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, classId, divisionId, divisions } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password, and role are required.' });
    }

    if (!['teacher', 'student', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Role must be teacher, student, or admin.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      if (existingUser.role === 'student') {
        return res.status(400).json({ message: `A student with email "${cleanEmail}" already exists in the system.` });
      }
      return res.status(400).json({ message: `A user with email "${cleanEmail}" already exists (${existingUser.role}).` });
    }

    let resolvedClassId = null;
    let resolvedDivisionId = null;
    let resolvedDivisions = [];

    
    
    if (role === 'student') {
      if (!classId || !divisionId) {
        return res.status(400).json({ message: 'Both classId and divisionId are required for students.' });
      }

      if (!mongoose.Types.ObjectId.isValid(classId) || !mongoose.Types.ObjectId.isValid(divisionId)) {
        return res.status(400).json({ message: 'Invalid classId or divisionId.' });
      }

      const targetClass = await Class.findById(classId);
      const targetDiv = await Class.findById(divisionId);

      if (!targetClass || !targetDiv) {
        return res.status(400).json({ message: 'Referenced class or division does not exist.' });
      }

      resolvedClassId = targetClass._id;
      resolvedDivisionId = targetDiv._id;
    }

    
    
    if (role === 'teacher') {
      if (!Array.isArray(divisions) || divisions.length === 0) {
        return res.status(400).json({ message: 'Teacher must be assigned to at least one division.' });
      }

      for (const dId of divisions) {
        if (!mongoose.Types.ObjectId.isValid(dId)) {
          return res.status(400).json({ message: `Invalid division ID: ${dId}` });
        }
      }

      const foundDivisions = await Class.find({ _id: { $in: divisions } });
      if (foundDivisions.length !== divisions.length) {
        return res.status(400).json({ message: 'One or more assigned division IDs do not exist.' });
      }

      resolvedDivisions = divisions;
    }

    
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      role,
      classId: resolvedClassId,
      divisionId: resolvedDivisionId,
      divisions: resolvedDivisions
    });

    const userObj = newUser.toObject();
    delete userObj.password;

    return res.status(201).json(userObj);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A user with this email address already exists in the system.' });
    }
    console.error('Create user error:', error);
    return res.status(500).json({ message: 'Error creating user.' });
  }
});


router.get('/users', async (req, res) => {
  try {
    const { role, classId, divisionId } = req.query;
    const filter = {};

    if (role) {
      filter.role = role;
    }
    if (classId) {
      if (mongoose.Types.ObjectId.isValid(classId)) {
        filter.classId = classId;
      }
    }
    if (divisionId) {
      if (mongoose.Types.ObjectId.isValid(divisionId)) {
        filter.divisionId = divisionId;
      }
    }

    const users = await User.find(filter)
      .select('-password')
      .populate('classId', 'className division')
      .populate('divisionId', 'className division')
      .populate('divisions', 'className division')
      .sort({ createdAt: -1 });

    return res.status(200).json(users);
  } catch (error) {
    console.error('List users error:', error);
    return res.status(500).json({ message: 'Error fetching users.' });
  }
});


router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const { name, email, password, classId, divisionId, divisions } = req.body;

    if (name) user.name = name.trim();
    if (email) {
      const cleanEmail = email.toLowerCase().trim();
      if (cleanEmail !== user.email) {
        const emailExists = await User.findOne({ email: cleanEmail });
        if (emailExists) {
          if (emailExists.role === 'student') {
            return res.status(400).json({ message: `A student with email "${cleanEmail}" already exists in the system.` });
          }
          return res.status(400).json({ message: `A user with email "${cleanEmail}" already exists (${emailExists.role}).` });
        }
        user.email = cleanEmail;
      }
    }

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    if (user.role === 'student') {
      if (classId !== undefined) {
        if (!mongoose.Types.ObjectId.isValid(classId)) {
          return res.status(400).json({ message: 'Invalid classId.' });
        }
        const targetClass = await Class.findById(classId);
        if (!targetClass) return res.status(400).json({ message: 'Referenced class does not exist.' });
        user.classId = targetClass._id;
      }

      if (divisionId !== undefined) {
        if (!mongoose.Types.ObjectId.isValid(divisionId)) {
          return res.status(400).json({ message: 'Invalid divisionId.' });
        }
        const targetDiv = await Class.findById(divisionId);
        if (!targetDiv) return res.status(400).json({ message: 'Referenced division does not exist.' });
        user.divisionId = targetDiv._id;
      }
    }

    if (user.role === 'teacher' && divisions !== undefined) {
      if (!Array.isArray(divisions) || divisions.length === 0) {
        return res.status(400).json({ message: 'Teacher must have at least one division.' });
      }

      for (const dId of divisions) {
        if (!mongoose.Types.ObjectId.isValid(dId)) {
          return res.status(400).json({ message: `Invalid division ID: ${dId}` });
        }
      }

      const foundDivisions = await Class.find({ _id: { $in: divisions } });
      if (foundDivisions.length !== divisions.length) {
        return res.status(400).json({ message: 'One or more assigned division IDs do not exist.' });
      }

      user.divisions = divisions;
    }

    await user.save();

    const updatedUser = await User.findById(id)
      .select('-password')
      .populate('classId', 'className division')
      .populate('divisionId', 'className division')
      .populate('divisions', 'className division');

    return res.status(200).json(updatedUser);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A user with this email address already exists in the system.' });
    }
    console.error('Update user error:', error);
    return res.status(500).json({ message: 'Error updating user.' });
  }
});


router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ message: 'User deleted successfully.', id });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ message: 'Error deleting user.' });
  }
});

module.exports = router;
