import mongoose from 'mongoose';
import School from '../models/School.js';
import User from '../models/User.js';
import MonthlyPayment from '../models/MonthlyPayment.js';
import Plan from '../models/Plan.js';
import ErrorLog from '../models/ErrorLog.js';
import { startOfMonth, endOfMonth } from 'date-fns';

import Lead from '../models/Lead.js';
import SupportTicket from '../models/SupportTicket.js';

/**
 * @desc    Get business metrics for Super Admin
 * @route   GET /api/super-admin/business-metrics
 * @access  Private (Super Admin)
 */
export const getBusinessMetrics = async (req, res) => {
  try {
    const totalSchools = await School.countDocuments();
    const activeSchools = await School.countDocuments({ status: 'active' });
    const trialSchools = await School.countDocuments({ 'subscription.type': 'trial' });
    const expiredSchools = await School.countDocuments({ 'subscription.status': 'Expired' });

    // Leads & Conversion
    const totalLeads = await Lead?.countDocuments() || 0;
    const convertedLeads = await Lead?.countDocuments({ status: 'converted' }) || 0;
    const conversionRate = totalLeads > 0 ? `${((convertedLeads / totalLeads) * 100).toFixed(1)}%` : '0%';

    // Support Stats
    const openTickets = await SupportTicket?.countDocuments({ status: 'open' }) || 0;
    const pendingTickets = await SupportTicket?.countDocuments({ status: 'pending' }) || 0;
    const resolvedLast30d = await SupportTicket?.countDocuments({ 
      status: 'resolved', 
      updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
    }) || 0;

    // Revenue metrics (Current Month)
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const revenueRecords = await MonthlyPayment.find({
      createdAt: { $gte: monthStart, $lte: monthEnd },
      status: 'Paid'
    });

    const monthlyRevenue = revenueRecords.reduce((sum, rec) => sum + (rec.amount || 0), 0);

    // Plan Distribution
    const planDistribution = await School.aggregate([
      { $group: { _id: '$subscription.plan', count: { $sum: 1 } } }
    ]);

    // Growth Rate (Schools added this month vs last month)
    const lastMonthStart = new Date(monthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    const lastMonthEnd = new Date(monthEnd);
    lastMonthEnd.setMonth(lastMonthEnd.getMonth() - 1);

    const schoolsThisMonth = await School.countDocuments({ createdAt: { $gte: monthStart } });
    const schoolsLastMonth = await School.countDocuments({ createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd } });
    const growthRate = schoolsLastMonth > 0 
      ? `${(((schoolsThisMonth - schoolsLastMonth) / schoolsLastMonth) * 100).toFixed(1)}%` 
      : '100%';

    // User metrics
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalTeachers = await User.countDocuments({ role: 'teacher' });

    res.json({
      success: true,
      data: {
        summary: {
          totalSchools,
          activeSchools,
          trialSchools,
          expiredSchools,
          totalLeads,
          activeUsersLast7d: 0,
          conversionRate,
          growthRate
        },
        revenue: {
          monthly: monthlyRevenue,
          currency: 'USD'
        },
        planDistribution,
        users: {
          students: totalStudents,
          teachers: totalTeachers,
          activeSessions: 0
        },
        supportStats: {
          openTickets,
          pendingTickets,
          resolvedLast30d
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get system health status for Super Admin
 * @route   GET /api/super-admin/system-health
 * @access  Private (Super Admin)
 */
export const getSystemHealth = async (req, res) => {
  try {
    // 1. Database Check
    const dbStatus = mongoose.connection.readyState === 1 ? 'Healthy' : 'Disconnected';

    // 2. Recent Errors (Last 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentErrors = await ErrorLog.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } });

    // 3. System Load (Node.js metrics)
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
      success: true,
      data: {
        database: dbStatus,
        errors24h: recentErrors,
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        memory: {
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`
        },
        status: recentErrors > 50 ? 'Warning' : 'Healthy'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
