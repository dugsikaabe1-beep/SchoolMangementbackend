/**
 * branchMiddleware.js
 *
 * Re-exports the canonical checkBranchAccess middleware from branchContext.js
 * and keeps the legacy `branchIsolation` export for backward compatibility so
 * existing routes that already import from this file continue to work.
 */
export {
  checkBranchAccess,
  checkBranchAccess as branchIsolation,  // legacy alias
  verifyBranchOwnership,
  getBranchContext,
} from './branchContext.js';
