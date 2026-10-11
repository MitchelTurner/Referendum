import { config } from 'dotenv';
import path from 'node:path';
import { MODULE_KEYS } from '@referendum/shared';
import { withTenant } from './client';

config({ path: path.resolve(__dirname, '../../../.env') });

const GOVERNMENTS = [
  {
    name: 'City of Ketchikan',
    shortName: 'City',
    colorToken: 'gov.city',
    citation: 'City of Ketchikan Code § TBD',
    bodies: [
      { name: 'City Council', code: 'CC' },
      { name: 'Port & Harbors Advisory Board', code: 'PHAB' },
    ],
  },
  {
    name: 'Ketchikan Gateway Borough',
    shortName: 'Borough',
    colorToken: 'gov.borough',
    citation: 'KGB Code § TBD',
    bodies: [
      { name: 'Assembly', code: 'ASM' },
      { name: 'Planning Commission / Platting Board', code: 'PC' },
    ],
  },
  {
    name: 'City of Saxman',
    shortName: 'Saxman',
    colorToken: 'gov.saxman',
    citation: 'City of Saxman Code § TBD',
    bodies: [{ name: 'Saxman City Council', code: 'CC' }],
  },
] as const;

export async function seedFoundation() {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const region = await tx.region.upsert({
      where: { slug: 'ketchikan' },
      update: { name: 'Ketchikan' },
      create: { name: 'Ketchikan', slug: 'ketchikan' },
    });
    for (const government of GOVERNMENTS) {
      const existing = await tx.government.findFirst({
        where: { regionId: region.id, name: government.name },
      });
      const row =
        existing ??
        (await tx.government.create({
          data: {
            regionId: region.id,
            name: government.name,
            shortName: government.shortName,
            colorToken: government.colorToken,
            timezone: 'America/Anchorage',
          },
        }));
      for (const module of MODULE_KEYS) {
        await tx.governmentModule.upsert({
          where: { governmentId_module: { governmentId: row.id, module } },
          update: {},
          create: { governmentId: row.id, module, enabled: true },
        });
      }
      for (const body of government.bodies) {
        await tx.body.upsert({
          where: { governmentId_code: { governmentId: row.id, code: body.code } },
          update: { name: body.name },
          create: { governmentId: row.id, name: body.name, code: body.code },
        });
      }
      const rule = await tx.noticeRule.findFirst({ where: { governmentId: row.id, bodyId: null, itemType: null } });
      if (!rule) {
        await tx.noticeRule.create({
          data: {
            governmentId: row.id,
            daysBefore: null,
            codeCitation: government.citation,
          },
        });
      }
      const retention = await tx.retentionRule.findFirst({
        where: { governmentId: row.id, documentKind: 'staff_report' },
      });
      if (!retention) {
        await tx.retentionRule.create({
          data: {
            governmentId: row.id,
            documentKind: 'staff_report',
            retainYears: null,
            citation: 'Retention schedule § TBD',
          },
        });
      }
    }
    return region;
  });
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedFoundation()
    .then(() => {
      console.log('Seeded Ketchikan region');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
