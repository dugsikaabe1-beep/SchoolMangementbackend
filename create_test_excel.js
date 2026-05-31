import ExcelJS from 'exceljs';

async function createTestExcel() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Students');

  // Define columns
  sheet.columns = [
    { header: 'Full Name', key: 'full_name', width: 25 },
    { header: 'Gender', key: 'gender', width: 10 },
    { header: 'Phone Number', key: 'phone_number', width: 18 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Class Name', key: 'class_name', width: 15 },
    { header: 'Section', key: 'section', width: 10 },
    { header: 'Parent Name', key: 'parent_name', width: 25 },
    { header: 'Place of Birth', key: 'place_of_birth', width: 20 },
    { header: 'Address', key: 'address', width: 30 },
    { header: 'Monthly Fees', key: 'monthly_fees', width: 15 },
    { header: 'Mode', key: 'mode', width: 12 },
  ];

  // Style header row
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.getRow(1).height = 22;

  // Add test data
  const testData = [
    {
      full_name: 'Ahmed Ali Hassan',
      gender: 'Male',
      phone_number: '0612345678',
      email: 'ahmed@example.com',
      class_name: 'Grade 10',
      section: 'A',
      parent_name: 'Ali Hassan',
      place_of_birth: 'Mogadishu',
      address: 'KM4 Hodan District',
      monthly_fees: '50',
      mode: 'Full-time'
    },
    {
      full_name: 'Fatima Omar Said',
      gender: 'Female',
      phone_number: '0698765432',
      email: '',
      class_name: 'Grade 9',
      section: 'B',
      parent_name: 'Omar Said',
      place_of_birth: 'Hargeisa',
      address: 'District 5',
      monthly_fees: '50',
      mode: 'Full-time'
    },
    {
      full_name: 'Mohamed Ibrahim',
      gender: 'Male',
      phone_number: '0655555555',
      email: 'mohamed@example.com',
      class_name: 'Grade 11',
      section: 'A',
      parent_name: 'Ibrahim Ali',
      place_of_birth: 'Bosaso',
      address: 'New Cairo',
      monthly_fees: '60',
      mode: 'Part-time'
    },
    {
      full_name: 'Aisha Mohamed',
      gender: 'Female',
      phone_number: '0677777777',
      email: 'aisha@example.com',
      class_name: 'Grade 8',
      section: 'B',
      parent_name: 'Mohamed Ali',
      place_of_birth: 'Mogadishu',
      address: 'Shaqaalaha',
      monthly_fees: '45',
      mode: 'Full-time'
    },
    {
      full_name: 'Abdullahi Yusuf',
      gender: 'Male',
      phone_number: '0633333333',
      email: '',
      class_name: 'Grade 12',
      section: 'A',
      parent_name: 'Yusuf Ahmed',
      place_of_birth: 'Hargeisa',
      address: 'Maroodijeex',
      monthly_fees: '70',
      mode: 'Full-time'
    },
    {
      full_name: 'Khadija Ali',
      gender: 'Female',
      phone_number: '0644444444',
      email: 'khadija@example.com',
      class_name: 'Grade 7',
      section: 'A',
      parent_name: 'Ali Omar',
      place_of_birth: 'Mogadishu',
      address: 'Yaqshid',
      monthly_fees: '40',
      mode: 'Full-time'
    },
    {
      full_name: 'Omar Hassan',
      gender: 'Male',
      phone_number: '0666666666',
      email: 'omar@example.com',
      class_name: 'Grade 10',
      section: 'B',
      parent_name: 'Hassan Ibrahim',
      place_of_birth: 'Bosaso',
      address: 'New District',
      monthly_fees: '50',
      mode: 'Full-time'
    },
    {
      full_name: 'Safia Ahmed',
      gender: 'Female',
      phone_number: '0688888888',
      email: '',
      class_name: 'Grade 9',
      section: 'A',
      parent_name: 'Ahmed Mohamed',
      place_of_birth: 'Mogadishu',
      address: 'Wadajir',
      monthly_fees: '45',
      mode: 'Full-time'
    },
    {
      full_name: 'Ibrahim Abdi',
      gender: 'Male',
      phone_number: '0622222222',
      email: 'ibrahim@example.com',
      class_name: 'Grade 11',
      section: 'B',
      parent_name: 'Abdi Yusuf',
      place_of_birth: 'Hargeisa',
      address: 'Gacan Libaax',
      monthly_fees: '60',
      mode: 'Part-time'
    },
    {
      full_name: 'Nimo Hussein',
      gender: 'Female',
      phone_number: '0611111111',
      email: 'nimo@example.com',
      class_name: 'Grade 8',
      section: 'A',
      parent_name: 'Hussein Ali',
      place_of_birth: 'Mogadishu',
      address: 'Kaaraan',
      monthly_fees: '40',
      mode: 'Full-time'
    }
  ];

  // Add data rows
  testData.forEach(data => {
    sheet.addRow(data);
  });

  // Add instructions sheet
  const infoSheet = workbook.addWorksheet('Instructions');
  infoSheet.getColumn(1).width = 80;
  const notes = [
    ['STUDENT IMPORT TEMPLATE — INSTRUCTIONS'],
    [''],
    ['Required columns:  Full Name, Class Name'],
    ['Optional columns:  Gender, Phone Number, Email, Section, Parent Name, Place of Birth, Address, Monthly Fees, Mode'],
    [''],
    ['Gender must be one of: Male, Female, Other'],
    ['Mode must be one of: Full-time, Part-time (defaults to Full-time)'],
    ['Phone numbers must be 7-15 digits (+ allowed)'],
    ['Do not modify the column headers in the Students sheet'],
  ];
  notes.forEach(([text], i) => {
    const cell = infoSheet.getCell(`A${i + 1}`);
    cell.value = text;
    if (i === 0) cell.font = { bold: true, size: 13 };
  });

  // Save file
  await workbook.xlsx.writeFile('test_student_import.xlsx');
  console.log('Excel file created successfully: test_student_import.xlsx');
}

createTestExcel().catch(console.error);
