export const renderTemplate = (templateString = '', data = {}) => {
  if (!templateString) return '';
  return String(templateString).replace(/{{\s*([^}]+)\s*}}/g, (_, key) => {
    const v = key.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), data);
    return v !== undefined && v !== null ? v : '';
  });
};

export default { renderTemplate };
