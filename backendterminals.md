# CRM 1 — Fix Lead Editing (For Real) + Build Deals Section
# Run STRICTLY IN SEQUENCE: R (diagnose) → S (fix lead editing) → T (build deals)
# Do NOT skip Terminal R. Code-on-top-of-bugs is why we're here.

OVERVIEW:
- Terminal R: walk 7 checks, find the actual broken link, paste a structured report
- Terminal S: apply a comprehensive fix with brute-force role bypasses so admin/super_admin
  ALWAYS work regardless of permission matrix state
- Terminal T: build the Deals section — FTD leads automatically appear in /deals

===================================================================================================
TERMINAL R — DIAGNOSE WHY ADMIN/SUPER ADMIN STILL CAN'T EDIT
Open: cd crm1 && claude
Paste this:
===================================================================================================

Read CLAUDE.md first. You write NO code. Walk these 7 checks in order, report findings.

User reports: logged in as super admin and admin, cannot change lead status, cannot reassign.
This has now been "fixed" multiple times without success. Find the actual cause.

---

## CHECK 1: Database column reality

```bash
cd backend
node -e "
const { sequelize } = require('./models');
(async () => {
  const cols = await sequelize.query(
    \"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='Leads' ORDER BY column_name\",
    { type: sequelize.QueryTypes.SELECT }
  );
  console.log('Leads table columns:');
  cols.forEach(c => console.log(' ', c.column_name, '(' + c.data_type + ')'));
  console.log('');
  console.log('Has assigned_to_id:', cols.some(c => c.column_name === 'assigned_to_id'));
  console.log('Has lead_owner_id:', cols.some(c => c.column_name === 'lead_owner_id'));
  console.log('Has ftd_at:', cols.some(c => c.column_name === 'ftd_at'));
  console.log('Has deposited_amount:', cols.some(c => c.column_name === 'deposited_amount'));
  process.exit(0);
})();
"
```

REPORT: Which assignment column exists? `assigned_to_id`, `lead_owner_id`, or BOTH?

---

## CHECK 2: Backend lead routes — are PATCH endpoints registered?

```bash
node -e "
const app = require('./server') || require('./index') || null;
// Just inspect routes file
const fs = require('fs');
const path = require('path');
const routesDir = './routes';
const leadsFile = ['leads.js', 'lead.js'].find(f => fs.existsSync(path.join(routesDir, f)));
console.log('Routes file:', leadsFile);
if (leadsFile) {
  const content = fs.readFileSync(path.join(routesDir, leadsFile), 'utf8');
  const routes = content.match(/router\.(get|post|patch|put|delete)\([^)]+/g) || [];
  console.log('Routes registered:');
  routes.forEach(r => console.log(' ', r));
}
process.exit(0);
"
```

REPORT: List every route registered. Specifically: is `PATCH /:id/status` there? `PATCH /:id` (general update)? `PATCH /:id/assign` or `/:id/reassign`?

---

## CHECK 3: Direct API hit — can the backend actually serve PATCH requests?

```bash
# Start backend if not running, then:
SA_TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@thework.ltd","password":"Test@1234"}' | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken','LOGIN_FAILED'))")
echo "SA token: ${SA_TOKEN:0:30}..."

LEAD_ID=$(curl -s -H "Authorization: Bearer $SA_TOKEN" "http://localhost:5000/api/v1/leads?limit=1" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('items', d.get('data',[])); print(items[0]['id'] if items else 'NONE')")
echo "Lead ID: $LEAD_ID"

echo ""
echo "=== A: super admin → PATCH /leads/:id/status with verbose ==="
curl -sv -X PATCH "http://localhost:5000/api/v1/leads/$LEAD_ID/status" \
  -H "Authorization: Bearer $SA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"lead_status":"interested"}' 2>&1 | grep -E "^(< HTTP|< |{)" | head -20

echo ""
echo "=== B: super admin → PATCH /leads/:id general update ==="
curl -sv -X PATCH "http://localhost:5000/api/v1/leads/$LEAD_ID" \
  -H "Authorization: Bearer $SA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"test","city":"Mumbai"}' 2>&1 | grep -E "^(< HTTP|< |{)" | head -20

echo ""
echo "=== C: super admin → PATCH /leads/:id/assign ==="
NEW_ASSIGNEE=$(curl -s -H "Authorization: Bearer $SA_TOKEN" "http://localhost:5000/api/v1/users?role=tele_sales&limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('items',d.get('data',[])); print(items[0]['id'] if items else 'NONE')")
curl -sv -X PATCH "http://localhost:5000/api/v1/leads/$LEAD_ID/assign" \
  -H "Authorization: Bearer $SA_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"new_assignee_id\":\"$NEW_ASSIGNEE\"}" 2>&1 | grep -E "^(< HTTP|< |{)" | head -20
```

REPORT for A, B, C: HTTP status code AND the response body. If 500, also paste the
last 20 lines of the backend console where the error appears.

---

## CHECK 4: Async without await — silent permission bypass bugs

```bash
echo "=== Sync can() calls (each is a bug) ==="
grep -rn "\b can(\|! can(\| can(req\|can(user" controllers/ middleware/ routes/ 2>/dev/null | grep -v "await can(" | grep -v "exports\." | grep -v "//"

echo ""
echo "=== Sync getLevel() calls ==="
grep -rn "getLevel(" controllers/ middleware/ routes/ 2>/dev/null | grep -v "await getLevel"

echo ""
echo "=== requirePermission middleware signature ==="
grep -A 5 "exports.requirePermission\|requirePermission = " middleware/roleGuard.js 2>/dev/null || echo "File not found"
```

REPORT: How many sync `can()` / `getLevel()` calls? Is requirePermission async?

---

## CHECK 5: What does /permissions/me return for super_admin RIGHT NOW?

```bash
echo "=== Super admin permissions ==="
curl -s -H "Authorization: Bearer $SA_TOKEN" "http://localhost:5000/api/v1/permissions/me" | python3 -m json.tool

echo ""
echo "=== Admin permissions ==="
ADMIN_TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@thework.ltd","password":"Test@1234"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "http://localhost:5000/api/v1/permissions/me" | python3 -m json.tool
```

REPORT: For each, what does `leads.change_status`, `leads.edit`, `leads.reassign` show?
What's `is_super_admin`?

---

## CHECK 6: Frontend store wiring

```bash
cd ../frontend

echo "=== useStore methods ==="
grep -n "canEditLead\|hasPermission\|isSuperAdmin\|isAdmin\|fetchPermissions\|permissions" store/useStore.js | head -30

echo ""
echo "=== Where fetchPermissions is called ==="
grep -rn "fetchPermissions" app/ components/ 2>/dev/null | head -10

echo ""
echo "=== Where canEditLead is called in leads page ==="
LEADS_PAGE=$(find app -path '*leads*' -name 'page.*' | head -1)
echo "Leads page: $LEADS_PAGE"
grep -n "canEditLead\|canEdit\|isSuperAdmin\|isAdmin\|hasPermission" "$LEADS_PAGE" 2>/dev/null | head -20

echo ""
echo "=== What field is being checked? assigned_to_id or lead_owner_id ==="
grep -n "assigned_to_id\|lead_owner_id" store/useStore.js "$LEADS_PAGE" 2>/dev/null
```

REPORT: Does the store check `assigned_to_id` or `lead_owner_id`? Is fetchPermissions
called on dashboard mount? What field name does the leads page expect?

---

## CHECK 7: Render-time inspection — what does the leads page actually output?

```bash
echo "=== Find Select / dropdown usage for status in leads page ==="
LEADS_PAGE=$(find app -path '*leads*' -name 'page.*' | head -1)
grep -B 2 -A 5 "lead_status\|StatusBadge\|handleStatusChange\|onValueChange" "$LEADS_PAGE" 2>/dev/null | head -60

echo ""
echo "=== Detail page editability ==="
DETAIL=$(find app -path '*leads/\[id\]*' -name 'page.*' | head -1)
echo "Detail: $DETAIL"
grep -n "disabled\|readOnly\|userCanEdit\|canEdit" "$DETAIL" 2>/dev/null | head -20
```

REPORT: Is the status cell rendered as a Select with onValueChange, OR a read-only
Badge? Is the detail page disabling fields based on canEdit?

---

## FINAL REPORT FORMAT

```
CHECK 1 — DB columns
- assigned_to_id exists: [yes / no]
- lead_owner_id exists: [yes / no]
- ftd_at exists: [yes / no]
- deposited_amount exists: [yes / no]

CHECK 2 — Backend routes
- PATCH /:id/status: [registered / missing]
- PATCH /:id: [registered / missing]
- PATCH /:id/assign or /:id/reassign: [registered / missing]
- Full list: [paste]

CHECK 3 — Direct API hits as super admin
- A status change: HTTP [code] body [paste]
- B general update: HTTP [code] body [paste]
- C assignment: HTTP [code] body [paste]

CHECK 4 — Async bugs
- Sync can() calls remaining: [count]
- Sync getLevel() calls: [count]
- requirePermission is async: [yes / no]

CHECK 5 — Permissions API
- Super admin /permissions/me: leads.edit = [value], is_super_admin = [bool]
- Admin /permissions/me: leads.edit = [value], leads.change_status = [value]

CHECK 6 — Frontend wiring
- Store checks field: [assigned_to_id / lead_owner_id]
- fetchPermissions called on dashboard mount: [yes / no]
- Leads page uses correct field name: [yes / no]

CHECK 7 — Render
- Status cell is a Select for admin/super_admin: [yes / no]
- Status cell is a read-only Badge: [yes / no]
- Detail page fields are disabled: [yes / no]

ROOT CAUSE GUESS
- [one sentence]
```

Paste this entire report. STOP. Do not write code.



===================================================================================================
TERMINAL S — FIX LEAD EDITING WITH BRUTE-FORCE OVERRIDES
Open: cd crm1 && claude
Paste this AFTER reading Terminal R's report:
===================================================================================================

Read CLAUDE.md first. Then read what Terminal R reported and paste it here before
running. The fix below is comprehensive — it doesn't trust any prior code. Apply
ALL of it even if Terminal R says some parts work.

[USER: paste Terminal R's FINAL REPORT here before starting]

The strategy: ignore the permission matrix entirely for admin and super_admin.
Hardcoded role checks at every layer that ALWAYS pass for these two roles.
This guarantees editing works even if the permission system is broken.

---

## FIX 1: Backend — replace the lead controller with brute-force role bypass

Overwrite backend/controllers/leadController.js completely. Use whichever
assignment column name your DB actually has (Terminal R told you):

```javascript
const { Lead, User, Group, Campaign, LeadActivity, AuditLog, sequelize } = require('../models');
const { Op } = require('sequelize');
const { success, error } = require('../utils/responseHelper');

const ASSIGN_COL = 'assigned_to_id';

const isAdminOrAbove = (role) => ['super_admin', 'admin'].includes(role);
const isManagement = (role) => ['super_admin', 'admin', 'floor_manager'].includes(role);

const isMyLead = (user, lead) => {
  if (!user || !lead) return false;
  const assignedId = lead[ASSIGN_COL] || lead.lead_owner_id;
  return assignedId && assignedId.toString() === user.id.toString();
};

const canEditLead = (user, lead) => {
  if (isAdminOrAbove(user.role)) return true;
  if (user.role === 'floor_manager') return true;
  if ((user.role === 'tele_sales' || user.role === 'senior') && isMyLead(user, lead)) return true;
  return false;
};

const canReassign = (user) => isManagement(user.role);

const buildScope = (user) => {
  if (isManagement(user.role) || ['back_office', 'auditor'].includes(user.role)) return {};
  return { [ASSIGN_COL]: user.id };
};

const INCLUDE_ASSIGNEE = [
  { model: User, as: 'assignedTo', attributes: ['id', 'first_name', 'last_name', 'native_language', 'role'], required: false },
  { model: Group, as: 'group', attributes: ['id', 'name', 'language'], required: false }
];

exports.list = async (req, res) => {
  try {
    const scope = buildScope(req.user);
    const { page = 1, limit = 50, search, status, lead_source, assignee_id, group_id, has_ftd, exclude_ftd } = req.query;
    const where = { ...scope };

    if (status) where.lead_status = status.includes(',') ? { [Op.in]: status.split(',') } : status;
    if (lead_source) where.lead_source = lead_source;
    if (assignee_id) where[ASSIGN_COL] = assignee_id;
    if (group_id) where.group_id = group_id;
    if (has_ftd === 'true') where.ftd_at = { [Op.ne]: null };
    if (has_ftd === 'false' || exclude_ftd === 'true') where.ftd_at = null;
    if (search) {
      where[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { ark_account_number: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await Lead.findAndCountAll({
      where, limit: parseInt(limit), offset,
      order: [['createdAt', 'DESC']],
      include: INCLUDE_ASSIGNEE
    });

    return success(res, {
      items: result.rows,
      pagination: { total: result.count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(result.count / parseInt(limit)) }
    });
  } catch (e) {
    console.error('Lead list error:', e);
    return error(res, e.message, 500);
  }
};

exports.getOne = async (req, res) => {
  try {
    const lead = await Lead.findByPk(req.params.id, { include: INCLUDE_ASSIGNEE });
    if (!lead) return error(res, 'Lead not found', 404);
    if (!isManagement(req.user.role) && !['back_office', 'auditor'].includes(req.user.role) && !isMyLead(req.user, lead)) {
      return error(res, 'Not authorized to view this lead', 403);
    }
    return success(res, lead);
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.update = async (req, res) => {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return error(res, 'Lead not found', 404);
    if (!canEditLead(req.user, lead)) {
      return error(res, 'Not authorized to edit this lead', 403);
    }

    const PROTECTED = ['id', 'createdAt', 'updatedAt', 'deleted_at', 'deleted_by'];
    if (!isManagement(req.user.role)) {
      PROTECTED.push(ASSIGN_COL, 'lead_owner_id', 'group_id', 'campaign_id', 'lead_source', 'is_trial');
    }

    const updates = {};
    for (const k of Object.keys(req.body)) {
      if (k === 'lead_owner_id' && !PROTECTED.includes(ASSIGN_COL)) {
        updates[ASSIGN_COL] = req.body[k];
      } else if (!PROTECTED.includes(k)) {
        updates[k] = req.body[k];
      }
    }

    const oldData = lead.toJSON();
    await lead.update(updates);

    await AuditLog.create({
      user_id: req.user.id, action: 'UPDATE', resource: 'Lead', resource_id: lead.id,
      old_data: oldData, new_data: lead.toJSON(), ip_address: req.ip
    }).catch(() => {});

    const refreshed = await Lead.findByPk(lead.id, { include: INCLUDE_ASSIGNEE });
    return success(res, refreshed, 'Lead updated');
  } catch (e) {
    console.error('Lead update error:', e);
    return error(res, e.message, 500);
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return error(res, 'Lead not found', 404);
    if (!canEditLead(req.user, lead)) {
      return error(res, 'Not authorized to update this lead', 403);
    }

    const { lead_status, sub_status, notes } = req.body;
    if (!lead_status) return error(res, 'lead_status is required', 400);

    const oldStatus = lead.lead_status;
    const updates = { lead_status, last_contact_date: new Date() };
    if (sub_status !== undefined) updates.sub_status = sub_status;

    if (lead_status === 'account_opened' && !lead.account_opened_at) {
      updates.account_opened_at = new Date();
    }
    if (lead_status === 'ftd_done' && !lead.ftd_at) {
      updates.ftd_at = new Date();
      if (!lead.account_opened_at) updates.account_opened_at = new Date();
    }

    await lead.update(updates);

    await LeadActivity.create({
      lead_id: lead.id, user_id: req.user.id, activity_type: 'status_change',
      title: `Status: ${oldStatus} → ${lead_status}`, description: notes || ''
    }).catch(() => {});

    await AuditLog.create({
      user_id: req.user.id, action: 'CHANGE_LEAD_STATUS', resource: 'Lead', resource_id: lead.id,
      old_data: { lead_status: oldStatus }, new_data: { lead_status, sub_status, notes }, ip_address: req.ip
    }).catch(() => {});

    const refreshed = await Lead.findByPk(lead.id, { include: INCLUDE_ASSIGNEE });
    return success(res, refreshed, 'Status updated');
  } catch (e) {
    console.error('Update status error:', e);
    return error(res, e.message, 500);
  }
};

exports.assign = async (req, res) => {
  try {
    if (!canReassign(req.user)) {
      return error(res, 'Only admin / floor manager can reassign leads', 403);
    }

    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return error(res, 'Lead not found', 404);

    const new_assignee_id = req.body.new_assignee_id || req.body.new_owner_id || req.body.assignee_id;
    if (!new_assignee_id) return error(res, 'new_assignee_id is required', 400);

    const newAssignee = await User.findByPk(new_assignee_id);
    if (!newAssignee) return error(res, 'Assignee not found', 404);
    if (!newAssignee.is_active) return error(res, 'Cannot assign to inactive user', 400);

    const oldAssigneeId = lead[ASSIGN_COL] || lead.lead_owner_id;
    await lead.update({ [ASSIGN_COL]: new_assignee_id });

    await LeadActivity.create({
      lead_id: lead.id, user_id: req.user.id, activity_type: 'reassignment',
      title: 'Lead reassigned',
      description: `Assigned to ${newAssignee.first_name} ${newAssignee.last_name}`
    }).catch(() => {});

    await AuditLog.create({
      user_id: req.user.id, action: 'ASSIGN_LEAD', resource: 'Lead', resource_id: lead.id,
      old_data: { [ASSIGN_COL]: oldAssigneeId },
      new_data: { [ASSIGN_COL]: new_assignee_id }, ip_address: req.ip
    }).catch(() => {});

    const refreshed = await Lead.findByPk(lead.id, { include: INCLUDE_ASSIGNEE });
    return success(res, refreshed, 'Lead reassigned');
  } catch (e) {
    console.error('Assign error:', e);
    return error(res, e.message, 500);
  }
};

exports.reassign = exports.assign;

exports.softDelete = async (req, res) => {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return error(res, 'Lead not found', 404);
    if (!isAdminOrAbove(req.user.role)) return error(res, 'Only admin can delete leads', 403);

    await lead.update({ is_deleted: true, deleted_at: new Date(), deleted_by: req.user.id });
    return success(res, null, 'Lead moved to recycle bin');
  } catch (e) { return error(res, e.message, 500); }
};

exports.addActivity = async (req, res) => {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return error(res, 'Lead not found', 404);
    if (!canEditLead(req.user, lead)) return error(res, 'Not authorized', 403);

    const activity = await LeadActivity.create({ ...req.body, lead_id: lead.id, user_id: req.user.id });
    if (req.body.activity_type === 'call') {
      await lead.update({
        total_attempted_call_count: (lead.total_attempted_call_count || 0) + 1,
        last_contact_date: new Date()
      });
    }
    return success(res, activity, 'Activity logged', 201);
  } catch (e) { return error(res, e.message, 500); }
};

exports.getActivities = async (req, res) => {
  try {
    const activities = await LeadActivity.findAll({
      where: { lead_id: req.params.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'role'] }],
      order: [['createdAt', 'DESC']]
    });
    return success(res, activities);
  } catch (e) { return error(res, e.message, 500); }
};
```

IMPORTANT — if Terminal R reported that the DB column is still `lead_owner_id`,
change line `const ASSIGN_COL = 'assigned_to_id';` to `const ASSIGN_COL = 'lead_owner_id';`
The whole controller will then work against the existing column.

---

## FIX 2: Backend routes — registered with explicit role guards, no permission matrix

Overwrite backend/routes/leads.js:

```javascript
const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleGuard');
const ctrl = require('../controllers/leadController');

const editorRoles = ['super_admin', 'admin', 'floor_manager', 'senior', 'tele_sales'];
const managementRoles = ['super_admin', 'admin', 'floor_manager'];
const adminRoles = ['super_admin', 'admin'];

router.get('/', verifyToken, ctrl.list);
router.get('/filter-options', verifyToken, ctrl.filterOptions || ((req,res) => res.json({success:true,data:{}})));
router.get('/:id', verifyToken, ctrl.getOne);
router.post('/', verifyToken, allowRoles(...managementRoles), ctrl.create || ((req,res) => res.status(501).json({success:false})));
router.patch('/:id', verifyToken, allowRoles(...editorRoles), ctrl.update);
router.patch('/:id/status', verifyToken, allowRoles(...editorRoles), ctrl.updateStatus);
router.patch('/:id/assign', verifyToken, allowRoles(...managementRoles), ctrl.assign);
router.patch('/:id/reassign', verifyToken, allowRoles(...managementRoles), ctrl.assign);
router.delete('/:id', verifyToken, allowRoles(...adminRoles), ctrl.softDelete);
router.post('/:id/activities', verifyToken, ctrl.addActivity);
router.get('/:id/activities', verifyToken, ctrl.getActivities);

module.exports = router;
```

Verify it's mounted in routes/index.js — `router.use('/leads', require('./leads'));`

Restart the backend.

---

## FIX 3: Frontend store — guarantee admin/super_admin always pass

Overwrite the relevant section of frontend/store/useStore.js:

```javascript
import { create } from 'zustand';
import api from '@/lib/api';

const useStore = create((set, get) => ({
  user: null,
  permissions: {},
  isSuperAdmin: false,
  isAdmin: false,
  isManagement: false,

  setUser: (user) => {
    const role = user?.role;
    set({
      user,
      isSuperAdmin: role === 'super_admin',
      isAdmin: role === 'admin' || role === 'super_admin',
      isManagement: ['super_admin', 'admin', 'floor_manager'].includes(role)
    });
  },

  updateUser: (patch) => set((state) => ({ user: { ...state.user, ...patch } })),

  fetchPermissions: async () => {
    try {
      const { data } = await api.get('/permissions/me');
      const role = data.data?.role || get().user?.role;
      set({
        permissions: data.data?.permissions || {},
        isSuperAdmin: data.data?.is_super_admin === true || role === 'super_admin',
        isAdmin: role === 'admin' || role === 'super_admin',
        isManagement: ['super_admin', 'admin', 'floor_manager'].includes(role)
      });
    } catch (e) {
      console.error('fetchPermissions failed:', e);
    }
  },

  canEditLead: (lead) => {
    const { user } = get();
    if (!user || !lead) return false;
    if (user.role === 'super_admin' || user.role === 'admin') return true;
    if (user.role === 'floor_manager') return true;
    const assignedId = lead.assigned_to_id || lead.lead_owner_id;
    if (user.role === 'tele_sales' && assignedId === user.id) return true;
    if (user.role === 'senior' && assignedId === user.id) return true;
    return false;
  },

  canReassign: () => {
    const { user } = get();
    return user && ['super_admin', 'admin', 'floor_manager'].includes(user.role);
  },

  canDeleteLead: () => {
    const { user } = get();
    return user && ['super_admin', 'admin'].includes(user.role);
  },

  isAssignedToMe: (lead) => {
    const { user } = get();
    if (!user || !lead) return false;
    const assignedId = lead.assigned_to_id || lead.lead_owner_id;
    return assignedId === user.id;
  },

  hasPermission: (key) => {
    const { user, permissions } = get();
    if (!user) return false;
    if (user.role === 'super_admin' || user.role === 'admin') return true;
    const level = permissions[key];
    return !!level && level !== 'none' && level !== false;
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
    set({ user: null, permissions: {}, isSuperAdmin: false, isAdmin: false, isManagement: false });
    if (typeof window !== 'undefined') window.location.href = '/login';
  }
}));

export default useStore;
```

CRITICAL RULES baked in:
- `canEditLead` returns true for super_admin/admin BEFORE checking anything else
- `canEditLead` accepts BOTH `assigned_to_id` and `lead_owner_id` so column-name confusion can't break it
- `hasPermission` returns true for super_admin/admin BEFORE checking the matrix
- `setUser` sets `isSuperAdmin` and `isAdmin` flags immediately based on `user.role`, so even if `fetchPermissions` fails the flags are correct

---

## FIX 4: Frontend leads page — read both column names, render Selects unconditionally

Find frontend/app/(dashboard)/leads/page.jsx. In the table row rendering, the
status cell MUST be a Select for any user where canEditLead returns true.

Find this pattern (or similar):
```jsx
<td className="p-3">
  {canEditThis ? (<Select ...>...) : (<Badge ...>{statusMeta.label}</Badge>)}
</td>
```

Verify it exists and uses `canEditLead(lead)` (not `canEditLeads` global boolean).
Also verify the owner column reads `lead.assigned_to_id || lead.lead_owner_id` so
both column names work:

```jsx
<Select value={lead.assigned_to_id || lead.lead_owner_id || ''} ...>
```

And in handleStatusChange / handleAssign, send to BOTH endpoints based on backend:

```jsx
const handleStatusChange = async (leadId, newStatus) => {
  const lead = leads.find(l => l.id === leadId);
  if (!lead || lead.lead_status === newStatus) return;
  setLeads(prev => prev.map(l => l.id === leadId ? { ...l, lead_status: newStatus } : l));
  try {
    await api.patch(`/leads/${leadId}/status`, { lead_status: newStatus });
    toast.success('Status updated', { duration: 1500 });
    if (newStatus === 'ftd_done') {
      toast.success('Lead moved to Deals — they made their first deposit', { duration: 3000 });
    }
  } catch (e) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, lead_status: lead.lead_status } : l));
    toast.error(e.response?.data?.message || 'Failed to update status');
  }
};

const handleAssign = async (leadId, newAssigneeId) => {
  const lead = leads.find(l => l.id === leadId);
  const currentId = lead?.assigned_to_id || lead?.lead_owner_id;
  if (!lead || currentId === newAssigneeId) return;
  try {
    const { data } = await api.patch(`/leads/${leadId}/assign`, { new_assignee_id: newAssigneeId });
    setLeads(prev => prev.map(l => l.id === leadId ? data.data : l));
    toast.success('Lead reassigned', { duration: 1500 });
  } catch (e) {
    toast.error(e.response?.data?.message || 'Failed to reassign');
  }
};
```

Also: by default, the /leads page should HIDE leads with status `ftd_done` (they
belong in Deals now). Add to the list params:

```jsx
useEffect(() => {
  const params = new URLSearchParams({ page: String(page), limit: '50' });
  if (!filters.show_ftd) params.set('exclude_ftd', 'true');
  for (const [k, v] of Object.entries(filters)) {
    if (v !== '' && v != null && k !== 'show_ftd') params.set(k, v);
  }
  api.get(`/leads?${params}`).then(...);
}, [page, JSON.stringify(filters)]);
```

Add a toggle in the filter bar:
```jsx
{ key: 'show_ftd', label: 'Include deals (FTD)', type: 'toggle', primary: false }
```

---

## FIX 5: Verify the fix end-to-end

```bash
SA_TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"superadmin@thework.ltd","password":"Test@1234"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

ADMIN_TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"admin@thework.ltd","password":"Test@1234"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

LEAD_ID=$(curl -s -H "Authorization: Bearer $SA_TOKEN" "http://localhost:5000/api/v1/leads?limit=1" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('items',d.get('data',[])); print(items[0]['id'] if items else 'NONE')")

echo "VERIFY 1: super admin status change"
curl -s -X PATCH "http://localhost:5000/api/v1/leads/$LEAD_ID/status" \
  -H "Authorization: Bearer $SA_TOKEN" -H "Content-Type: application/json" \
  -d '{"lead_status":"interested"}' | python3 -m json.tool | head -10

echo ""
echo "VERIFY 2: admin status change"
curl -s -X PATCH "http://localhost:5000/api/v1/leads/$LEAD_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"lead_status":"contacted"}' | python3 -m json.tool | head -10

echo ""
echo "VERIFY 3: super admin general update"
curl -s -X PATCH "http://localhost:5000/api/v1/leads/$LEAD_ID" \
  -H "Authorization: Bearer $SA_TOKEN" -H "Content-Type: application/json" \
  -d '{"city":"Mumbai","notes":"Test note from fix"}' | python3 -m json.tool | head -10

echo ""
echo "VERIFY 4: admin reassign"
NEW_ASSIGNEE=$(curl -s -H "Authorization: Bearer $SA_TOKEN" "http://localhost:5000/api/v1/users?role=tele_sales&limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('items',d.get('data',[])); print(items[0]['id'])")
curl -s -X PATCH "http://localhost:5000/api/v1/leads/$LEAD_ID/assign" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"new_assignee_id\":\"$NEW_ASSIGNEE\"}" | python3 -m json.tool | head -10

echo ""
echo "VERIFY 5: admin marks FTD — should move lead to deals"
curl -s -X PATCH "http://localhost:5000/api/v1/leads/$LEAD_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"lead_status":"ftd_done"}' | python3 -m json.tool | head -10

echo ""
echo "VERIFY 6: leads list excludes FTD by default"
curl -s -H "Authorization: Bearer $SA_TOKEN" "http://localhost:5000/api/v1/leads?exclude_ftd=true" | \
  python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(f'Non-FTD leads: {len(d[\"items\"])}'); ftd = [l for l in d['items'] if l.get('lead_status') == 'ftd_done']; print(f'FTD in results (should be 0): {len(ftd)}')"
```

ALL 6 verifies must return success. If any fail, paste the response and fix
before continuing to Terminal T.

Also do a Playwright test:
1. Login as super admin → /leads → click status dropdown on any row → change to "Interested" → see green toast "Status updated"
2. Same user → click assignee dropdown → pick different teleseller → see "Lead reassigned"
3. Login as admin → /leads → repeat both — must work identically
4. Mark a lead as "FTD done" → it should disappear from /leads (filtered out by exclude_ftd)

Report findings. Once all pass, proceed to Terminal T.



===================================================================================================
TERMINAL T — BUILD THE DEALS SECTION
Open: cd crm1 && claude
Paste this AFTER Terminal S confirms all 6 verifies pass:
===================================================================================================

Read CLAUDE.md first. You build the Deals section — leads with FTD done are now
"deals" and live in their own /deals page.

Concept:
- A Deal is the SAME record as a Lead — no new database table needed
- Filter: `lead.ftd_at IS NOT NULL` OR `lead.lead_status = 'ftd_done'`
- /leads page hides these (already done by Terminal S)
- /deals page shows ONLY these with deal-specific columns

---

## BACKEND: deals controller

Create backend/controllers/dealController.js:

```javascript
const { Lead, User, Group, Campaign, LeadActivity, AuditLog, sequelize } = require('../models');
const { Op } = require('sequelize');
const { success, error } = require('../utils/responseHelper');

const ASSIGN_COL = 'assigned_to_id';

const isManagement = (role) => ['super_admin', 'admin', 'floor_manager'].includes(role);

const buildScope = (user) => {
  if (isManagement(user.role) || ['back_office', 'auditor'].includes(user.role)) return {};
  return { [ASSIGN_COL]: user.id };
};

exports.list = async (req, res) => {
  try {
    const scope = buildScope(req.user);
    const {
      page = 1, limit = 50, search,
      assignee_id, group_id, campaign_id, lead_source,
      ftd_from, ftd_to,
      deposit_min, deposit_max,
      language,
      sort_by = 'ftd_at', sort_dir = 'DESC'
    } = req.query;

    const where = {
      ...scope,
      ftd_at: { [Op.ne]: null }
    };

    if (assignee_id) where[ASSIGN_COL] = assignee_id;
    if (group_id) where.group_id = group_id;
    if (campaign_id) where.campaign_id = campaign_id;
    if (lead_source) where.lead_source = lead_source;
    if (language) where.language = language;

    if (ftd_from || ftd_to) {
      where.ftd_at = { [Op.ne]: null };
      if (ftd_from) where.ftd_at[Op.gte] = new Date(ftd_from);
      if (ftd_to) where.ftd_at[Op.lte] = new Date(ftd_to);
    }

    if (deposit_min !== undefined || deposit_max !== undefined) {
      where.deposited_amount = {};
      if (deposit_min !== undefined && deposit_min !== '') where.deposited_amount[Op.gte] = parseFloat(deposit_min);
      if (deposit_max !== undefined && deposit_max !== '') where.deposited_amount[Op.lte] = parseFloat(deposit_max);
    }

    if (search) {
      where[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { ark_account_number: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const allowedSorts = ['ftd_at', 'deposited_amount', 'first_name', 'last_contact_date', 'createdAt'];
    const orderBy = allowedSorts.includes(sort_by) ? sort_by : 'ftd_at';
    const orderDir = ['ASC', 'DESC'].includes(sort_dir?.toUpperCase()) ? sort_dir.toUpperCase() : 'DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await Lead.findAndCountAll({
      where, limit: parseInt(limit), offset,
      order: [[orderBy, orderDir]],
      include: [
        { model: User, as: 'assignedTo', attributes: ['id', 'first_name', 'last_name', 'role'], required: false },
        { model: Group, as: 'group', attributes: ['id', 'name'], required: false }
      ]
    });

    return success(res, {
      items: result.rows,
      pagination: { total: result.count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(result.count / parseInt(limit)) }
    });
  } catch (e) {
    console.error('Deal list error:', e);
    return error(res, e.message, 500);
  }
};

exports.stats = async (req, res) => {
  try {
    const scope = buildScope(req.user);
    const where = { ...scope, ftd_at: { [Op.ne]: null } };

    const [total, totalDeposits, avgDeposit, todayCount, thisMonthCount] = await Promise.all([
      Lead.count({ where }),
      Lead.sum('deposited_amount', { where }),
      Lead.findOne({ where, attributes: [[sequelize.fn('AVG', sequelize.col('deposited_amount')), 'avg']], raw: true }),
      Lead.count({ where: { ...where, ftd_at: { [Op.gte]: new Date(new Date().setHours(0,0,0,0)) } } }),
      Lead.count({ where: { ...where, ftd_at: { [Op.gte]: new Date(new Date().setDate(1)) } } }),
    ]);

    const bySource = await Lead.findAll({
      where,
      attributes: ['lead_source', [sequelize.fn('COUNT', sequelize.col('id')), 'count'], [sequelize.fn('SUM', sequelize.col('deposited_amount')), 'total']],
      group: ['lead_source'],
      raw: true
    });

    const byAssignee = await Lead.findAll({
      where,
      attributes: [ASSIGN_COL, [sequelize.fn('COUNT', sequelize.col('id')), 'count'], [sequelize.fn('SUM', sequelize.col('deposited_amount')), 'total']],
      group: [ASSIGN_COL],
      order: [[sequelize.literal('total'), 'DESC']],
      limit: 10,
      raw: true
    });

    const assigneeIds = byAssignee.map(r => r[ASSIGN_COL]).filter(Boolean);
    const assignees = await User.findAll({
      where: { id: { [Op.in]: assigneeIds } },
      attributes: ['id', 'first_name', 'last_name', 'role']
    });
    const assigneeMap = Object.fromEntries(assignees.map(u => [u.id, u]));

    return success(res, {
      total,
      totalDeposits: parseFloat(totalDeposits || 0),
      avgDeposit: parseFloat(avgDeposit?.avg || 0),
      todayCount,
      thisMonthCount,
      bySource: bySource.map(r => ({
        source: r.lead_source,
        count: parseInt(r.count),
        total: parseFloat(r.total || 0)
      })),
      byAssignee: byAssignee.map(r => ({
        assignee_id: r[ASSIGN_COL],
        assignee: assigneeMap[r[ASSIGN_COL]] || null,
        count: parseInt(r.count),
        total: parseFloat(r.total || 0)
      }))
    });
  } catch (e) {
    console.error('Deal stats error:', e);
    return error(res, e.message, 500);
  }
};
```

Create backend/routes/deals.js:

```javascript
const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const ctrl = require('../controllers/dealController');

router.get('/', verifyToken, ctrl.list);
router.get('/stats', verifyToken, ctrl.stats);

module.exports = router;
```

Mount in backend/routes/index.js:
```javascript
router.use('/deals', require('./deals'));
```

---

## FRONTEND: Deals page

Create frontend/app/(dashboard)/deals/page.jsx:

```jsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, DollarSign, Award, Calendar, ArrowRight, Phone, Mail } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import useStore from '@/store/useStore';

export default function DealsPage() {
  const { user, isAdmin, isSuperAdmin } = useStore();
  const [deals, setDeals] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [assignees, setAssignees] = useState([]);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [sortBy, setSortBy] = useState('ftd_at');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });

  const loadDeals = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', sort_by: sortBy, sort_dir: 'DESC' });
      if (search) params.set('search', search);
      if (sourceFilter) params.set('lead_source', sourceFilter);
      if (assigneeFilter) params.set('assignee_id', assigneeFilter);
      const { data } = await api.get(`/deals?${params}`);
      setDeals(data.data.items || []);
      setPagination(data.data.pagination || { total: 0, totalPages: 0 });
    } catch (e) { toast.error('Failed to load deals'); }
    finally { setLoading(false); }
  };

  const loadStats = async () => {
    try {
      const { data } = await api.get('/deals/stats');
      setStats(data.data);
    } catch (e) { console.error(e); }
  };

  const loadAssignees = async () => {
    try {
      const [t, s] = await Promise.all([
        api.get('/users?role=tele_sales&limit=100'),
        api.get('/users?role=senior&limit=100')
      ]);
      const list = [...(t.data.data?.items || t.data.data || []), ...(s.data.data?.items || s.data.data || [])];
      setAssignees(list);
    } catch (e) {}
  };

  useEffect(() => { loadStats(); loadAssignees(); }, []);
  useEffect(() => { loadDeals(); }, [page, sourceFilter, assigneeFilter, sortBy]);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); loadDeals(); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fmtMoney = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const fmtCompact = (n) => {
    n = Number(n || 0);
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k';
    return '₹' + n;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Award className="h-5 w-5 text-emerald-400" />
            Deals
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Leads who made their first deposit · {pagination.total} {pagination.total === 1 ? 'deal' : 'deals'}
          </p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total deals</p>
              <p className="text-2xl font-medium mt-1">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total deposits</p>
              <p className="text-2xl font-medium mt-1 text-emerald-400">{fmtCompact(stats.totalDeposits)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Avg deposit</p>
              <p className="text-2xl font-medium mt-1">{fmtCompact(stats.avgDeposit)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Today</p>
              <p className="text-2xl font-medium mt-1 text-amber-400">{stats.todayCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">This month</p>
              <p className="text-2xl font-medium mt-1">{stats.thisMonthCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {(isAdmin || isSuperAdmin) && stats?.byAssignee?.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top deal makers</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.byAssignee.slice(0, 5).map(r => (
                <div key={r.assignee_id} className="flex items-center justify-between gap-3 p-2 rounded hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs font-medium">
                      {r.assignee?.first_name?.[0]}{r.assignee?.last_name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{r.assignee ? `${r.assignee.first_name} ${r.assignee.last_name}` : 'Unknown'}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{r.assignee?.role?.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{fmtCompact(r.total)}</p>
                    <p className="text-[10px] text-muted-foreground">{r.count} deals</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Input placeholder="Search name, phone, ARK#..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 text-sm" />
        </div>

        <Select value={sourceFilter || 'all'} onValueChange={v => { setSourceFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All sources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="facebook_ads">Facebook Ads</SelectItem>
            <SelectItem value="instagram_ads">Instagram Ads</SelectItem>
            <SelectItem value="direct_ark">Direct ARK</SelectItem>
          </SelectContent>
        </Select>

        {(isAdmin || isSuperAdmin) && (
          <Select value={assigneeFilter || 'all'} onValueChange={v => { setAssigneeFilter(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-48 h-9 text-sm"><SelectValue placeholder="All assignees" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {assignees.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ftd_at">Newest FTD first</SelectItem>
            <SelectItem value="deposited_amount">Largest deposit</SelectItem>
            <SelectItem value="last_contact_date">Recently contacted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left p-3 font-medium text-muted-foreground">Customer</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Deposit</th>
                <th className="text-left p-3 font-medium text-muted-foreground">FTD date</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Source</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Assigned to</th>
                <th className="text-left p-3 font-medium text-muted-foreground">ARK</th>
                <th className="p-3 text-right font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading...</td></tr>}
              {!loading && deals.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No deals yet. Deals appear here when a lead completes their first deposit.
                </td></tr>
              )}
              {deals.map(d => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-3">
                    <Link href={`/leads/${d.id}`} className="hover:text-blue-400">
                      <p className="font-medium">{d.first_name} {d.last_name}</p>
                    </Link>
                    <p className="text-muted-foreground font-mono text-[11px] mt-0.5 flex items-center gap-1">
                      <Phone className="h-2.5 w-2.5" />
                      {d.phone}
                    </p>
                  </td>
                  <td className="p-3">
                    <p className="font-medium text-emerald-400">{fmtMoney(d.deposited_amount)}</p>
                  </td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">
                    {d.ftd_at ? new Date(d.ftd_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td className="p-3">
                    {d.lead_source === 'direct_ark' ? (
                      <Badge variant="outline" className="text-[10px] text-teal-400 border-teal-500/30">Direct ARK</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/30">
                        {(d.lead_source || 'facebook_ads').replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </td>
                  <td className="p-3">
                    {d.assignedTo ? (
                      <span>{d.assignedTo.first_name} {d.assignedTo.last_name}</span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px] text-teal-400 border-teal-500/30 font-mono">
                      {d.ark_account_number || '—'}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                      <Link href={`/leads/${d.id}`}>View<ArrowRight className="h-3 w-3 ml-1" /></Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {pagination.totalPages}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## SIDEBAR: add Deals link

Open frontend/components/layout/Sidebar.jsx. Find the nav items array. Add:

```jsx
import { Award } from 'lucide-react';
{ label: 'Deals', href: '/deals', icon: Award }
```

Place it right after "Leads" in the nav list. Visible to ALL authenticated users
(role-scoping is enforced server-side already).

---

## DASHBOARD: add Deals metric card

In frontend/app/(dashboard)/dashboard/page.jsx, find the top metrics row.

Add a "Deals" metric card next to Leads:
```jsx
const [dealStats, setDealStats] = useState(null);
useEffect(() => {
  api.get('/deals/stats').then(({data}) => setDealStats(data.data)).catch(() => {});
}, []);

{/* Inside the metrics grid */}
{dealStats && (
  <Card>
    <CardContent className="p-4">
      <Link href="/deals" className="block hover:opacity-80 transition-opacity">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Award className="h-3 w-3" /> Deals
        </p>
        <p className="text-2xl font-medium mt-1 text-emerald-400">{dealStats.total}</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          ₹{(dealStats.totalDeposits / 100000).toFixed(1)}L deposited
        </p>
      </Link>
    </CardContent>
  </Card>
)}
```

---

## VERIFY

```bash
SA_TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"superadmin@thework.ltd","password":"Test@1234"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

echo "TEST 1: Deals list"
curl -s -H "Authorization: Bearer $SA_TOKEN" "http://localhost:5000/api/v1/deals" | \
  python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(f'Total deals: {len(d[\"items\"])}'); [print(f'  - {x[\"first_name\"]} {x[\"last_name\"]} ₹{x.get(\"deposited_amount\",0)}') for x in d['items']]"

echo ""
echo "TEST 2: Deal stats"
curl -s -H "Authorization: Bearer $SA_TOKEN" "http://localhost:5000/api/v1/deals/stats" | python3 -m json.tool

echo ""
echo "TEST 3: Mark a lead as FTD → appears in deals"
LEAD_ID=$(curl -s -H "Authorization: Bearer $SA_TOKEN" "http://localhost:5000/api/v1/leads?limit=1&status=interested" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('items',d.get('data',[])); print(items[0]['id'] if items else '')")
if [ -n "$LEAD_ID" ]; then
  curl -s -X PATCH "http://localhost:5000/api/v1/leads/$LEAD_ID" \
    -H "Authorization: Bearer $SA_TOKEN" -H "Content-Type: application/json" \
    -d '{"lead_status":"ftd_done","ftd_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","deposited_amount":25000}' > /dev/null
  echo "Marked lead $LEAD_ID as FTD"
  echo "Deals list now:"
  curl -s -H "Authorization: Bearer $SA_TOKEN" "http://localhost:5000/api/v1/deals" | \
    python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(f'Total deals: {len(d[\"items\"])}')"
fi

echo ""
echo "TEST 4: Leads list excludes FTDs by default"
curl -s -H "Authorization: Bearer $SA_TOKEN" "http://localhost:5000/api/v1/leads?exclude_ftd=true" | \
  python3 -c "import sys,json; d=json.load(sys.stdin)['data']['items']; ftd = [l for l in d if l.get('lead_status') == 'ftd_done']; print(f'FTDs in leads list (should be 0): {len(ftd)}')"
```

Then Playwright:

1. Super admin → /dashboard → see "Deals" metric card with count and total deposits
2. Click it → /deals page opens
3. Stat cards visible: Total deals, Total deposits, Avg, Today, This month
4. Top deal makers card (admin/super_admin only)
5. Sortable, searchable, filterable
6. Go to /leads → mark any non-FTD lead as "FTD done" → toast "Lead moved to Deals"
7. /leads no longer shows that lead
8. /deals now shows it

Report findings.