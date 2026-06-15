import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import User from '../models/User.js';
import MonthlyPayment from '../models/MonthlyPayment.js';
import Attendance from '../models/Attendance.js';
import Exam from '../models/Exam.js';
import Class from '../models/Class.js';
import { tenantFilter } from '../utils/tenantQuery.js';

/**
 * @desc    Export data to Excel or CSV
 * @route   GET /api/v1/enterprise/export/:entity
 * @access  Private
 */
export const exportData = async (req, res) => {
  const { entity } = req.params;
  const { format = 'excel' } = req.query;
  const filter = tenantFilter(req);

  try {
    let data = [];
    let columns = [];
    let fileName = `export-${entity}-${Date.now()}`;

    switch (entity) {
      case 'students':
        data = await User.find({ ...filter, role: 'student' }).populate('class', 'name section').lean();
        columns = [
          { header: 'Student ID', key: 'customId', width: 15 },
          { header: 'Full Name', key: 'name', width: 30 },
          { header: 'Email', key: 'email', width: 25 },
          { header: 'Phone', key: 'phone', width: 15 },
          { header: 'Class', key: 'className', width: 15 },
          { header: 'Status', key: 'status', width: 10 }
        ];
        data = data.map(d => ({ ...d, className: d.class ? `${d.class.name} ${d.class.section}` : 'N/A' }));
        break;

      case 'teachers':
        data = await User.find({ ...filter, role: 'teacher' }).lean();
        columns = [
          { header: 'Teacher ID', key: 'customId', width: 15 },
          { header: 'Full Name', key: 'name', width: 30 },
          { header: 'Email', key: 'email', width: 25 },
          { header: 'Phone', key: 'phone', width: 15 },
          { header: 'Status', key: 'status', width: 10 }
        ];
        break;

      case 'payments':
        data = await MonthlyPayment.find(filter).populate('student', 'name customId').lean();
        columns = [
          { header: 'Invoice ID', key: 'invoiceId', width: 15 },
          { header: 'Student', key: 'studentName', width: 30 },
          { header: 'Amount', key: 'amount', width: 12 },
          { header: 'Status', key: 'status', width: 10 },
          { header: 'Date', key: 'paymentDate', width: 15 }
        ];
        data = data.map(d => ({ 
          ...d, 
          studentName: d.student ? `${d.student.name} (${d.student.customId})` : 'Unknown',
          paymentDate: d.paymentDate ? new Date(d.paymentDate).toLocaleDateString() : 'N/A'
        }));
        break;

      default:
        return res.status(400).json({ success: false, message: 'Invalid entity for export' });
    }

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}.csv`);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Data');
      worksheet.columns = columns;
      worksheet.addRows(data);
      await workbook.csv.write(res);
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}.xlsx`);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Data');
      worksheet.columns = columns;
      worksheet.addRows(data);
      
      // Styling
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      await workbook.xlsx.write(res);
    }
    res.end();
  } catch (error) {
    console.error(`[Export] Error exporting ${entity}:`, error.message);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};
