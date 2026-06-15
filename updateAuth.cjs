const fs = require('fs');
const file = 'c:/Users/hp/Desktop/schoolManagementSystem/backend/src/controllers/authController.js';
let content = fs.readFileSync(file, 'utf8');

const helper = `// Account lockout helper
const checkLockout = (user) => {
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const remainingMin = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return { locked: true, remainingMin };
  }
  return { locked: false };
};

const handleFailedLogin = async (user) => {
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 30 * 60 * 1000;
  user.loginAttempts = (user.loginAttempts || 0) + 1;
  if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    user.lockUntil = Date.now() + LOCK_TIME;
    user.loginAttempts = 0;
  }
  await user.save();
};

const handleSuccessfulLogin = async (user) => {
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLogin = Date.now();
  await user.save();
};

`;

// Insert helper after issueTokens
content = content.replace('const issueTokens = async (res, user) => {\n  const access = generateAccessToken(user);\n  setTokenCookies(res, generateRefreshToken(user));\n  return access;\n};', 'const issueTokens = async (res, user) => {\n  const access = generateAccessToken(user);\n  setTokenCookies(res, generateRefreshToken(user));\n  return access;\n};\n\n' + helper);

// Student Login Replace
content = content.replace(
  'const isMatch = await user.matchPassword(password);\n    if (isMatch) {',
  `const lockoutStatus = checkLockout(user);
    if (lockoutStatus.locked) {
      return res.status(403).json({
        message: 'Account locked',
        userMessage: \`Too many failed login attempts. Your account is locked for another \${lockoutStatus.remainingMin} minutes.\`
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      await handleFailedLogin(user);
      console.log(\`Student password mismatch: \${customId}\`);
      return res.status(401).json({ 
        message: 'Invalid Student ID or password',
        userMessage: 'Invalid Student ID or password. Please check and try again.'
      });
    }

    await handleSuccessfulLogin(user);
    if (true) {`
);

content = content.replace(
  /} else {\n\s*console\.log\(`Student password mismatch: \${customId}`\);\n\s*res\.status\(401\)\.json\({[\s\S]*?}\);\n\s*}/,
  '}'
);

// Teacher Login Replace
content = content.replace(
  'const isMatch = await user.matchPassword(password);\n    if (isMatch) {',
  `const lockoutStatus = checkLockout(user);
    if (lockoutStatus.locked) {
      return res.status(403).json({
        message: 'Account locked',
        userMessage: \`Too many failed login attempts. Your account is locked for another \${lockoutStatus.remainingMin} minutes.\`
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      await handleFailedLogin(user);
      console.log(\`Teacher password mismatch: \${customId}\`);
      return res.status(401).json({ 
        message: 'Invalid Teacher ID or password',
        userMessage: 'Invalid Teacher ID or password. Please check and try again.'
      });
    }

    await handleSuccessfulLogin(user);
    if (true) {`
);

content = content.replace(
  /} else {\n\s*console\.log\(`Teacher password mismatch: \${customId}`\);\n\s*res\.status\(401\)\.json\({[\s\S]*?}\);\n\s*}/,
  '}'
);

// Parent Login Replace
content = content.replace(
  'const isMatch = await user.matchPassword(password);\n    if (!isMatch) {\n      return res.status(401).json({\n        message: \'Invalid parent credentials\',\n        userMessage: \'Invalid email/ID or password.\',\n      });\n    }\n\n    user.lastLogin = Date.now();\n    await user.save();',
  `const lockoutStatus = checkLockout(user);
    if (lockoutStatus.locked) {
      return res.status(403).json({
        message: 'Account locked',
        userMessage: \`Too many failed login attempts. Your account is locked for another \${lockoutStatus.remainingMin} minutes.\`
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      await handleFailedLogin(user);
      return res.status(401).json({
        message: 'Invalid parent credentials',
        userMessage: 'Invalid email/ID or password.',
      });
    }

    await handleSuccessfulLogin(user);`
);

// Admin Login Replace (Superadmin logic)
content = content.replace(
  'if (user && (await user.matchPassword(password))) {\n        return res.json({',
  `const lockoutStatus = checkLockout(user);
      if (lockoutStatus.locked) {
        return res.status(403).json({
          message: 'Account locked',
          userMessage: \`Too many failed login attempts. Your account is locked for another \${lockoutStatus.remainingMin} minutes.\`
        });
      }

      if (user && (await user.matchPassword(password))) {
        await handleSuccessfulLogin(user);
        return res.json({`
);

// We need a specific failure replace for adminLogin superadmin because the match is inline
// Let's modify adminLogin via replace_file_content instead of string replace in this script for safety.

fs.writeFileSync(file, content);
console.log('Modified authController.js');
