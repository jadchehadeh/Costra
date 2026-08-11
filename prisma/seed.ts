import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const db = new PrismaClient();
const permissions = [
  ['projects.read','View projects'], ['projects.write','Create and update projects'],
  ['reports.read','View reports'], ['financial.read','View financial modules'],
  ['financial.write','Manage financial records'], ['users.manage','Manage users and roles'],
  ['settings.manage','Manage system settings'], ['audit.read','View audit history']
];
async function main() {
  for (const [key, description] of permissions) await db.permission.upsert({ where:{key}, update:{description}, create:{key,description} });
  const roles = [
    { key:'SYSTEM_ADMIN', name:'System Administrator', grants:['users.manage','settings.manage','audit.read','projects.read','reports.read'] },
    { key:'COST_CONTROL_MANAGER', name:'Cost Control Manager', grants:['projects.read','projects.write','reports.read','financial.read','financial.write','audit.read'] },
    { key:'BOARD_EXECUTIVE', name:'Board / Executive', grants:['projects.read','reports.read','financial.read'] }
  ];
  for (const item of roles) {
    const role = await db.role.upsert({ where:{key:item.key}, update:{name:item.name}, create:{key:item.key,name:item.name} });
    const grants = await db.permission.findMany({ where:{key:{in:item.grants}} });
    await db.rolePermission.deleteMany({where:{roleId:role.id}});
    await db.rolePermission.createMany({data:grants.map(p=>({roleId:role.id,permissionId:p.id}))});
  }
  const role = await db.role.findUniqueOrThrow({where:{key:'COST_CONTROL_MANAGER'}});
  await db.user.upsert({where:{email:'manager@costra.local'},update:{},create:{email:'manager@costra.local',name:'Cost Control Manager',passwordHash:await bcrypt.hash('ChangeMe123!',12),roleId:role.id}});
  await db.applicationSetting.upsert({where:{key:'company.profile'},update:{},create:{key:'company.profile',value:{name:'COSTRA Company',defaultCurrency:'SAR'},description:'Single-company profile'}});
}
main().finally(()=>db.$disconnect());
