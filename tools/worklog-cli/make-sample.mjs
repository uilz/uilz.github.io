#!/usr/bin/env node
// Generates sample/worklog-sample.zip — a deterministic, synthetic Worklog full
// backup (schema 6) used for hand-off and contract testing.
//
// The real app produces the same structure via 「导出完整备份」.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from './lib/zip.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(here, 'sample', 'worklog-sample.zip');

const WS_ID = 'ws_demo';
const EXPORTED_AT = '2026-10-20T00:00:00.000Z';

const minutes = Buffer.from(
  [
    '会议纪要（样例）',
    '',
    '1. 确认交付契约 v0.1。',
    '2. list / export 只读，不联网。',
    '3. 转写与摘要由平台侧承担。',
    '',
  ].join('\n'),
  'utf8',
);

const diagram = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000010000000100806000000' +
    '1ff3ff61000000097048597300000ec400000ec401952b0e1b000000' +
    '1a49444154789c6360a03d0000000600012e0a0b0000000049454e44ae426082',
  'hex',
);

const files = [
  {
    id: 'file_notes',
    workspaceId: WS_ID,
    name: '会议纪要.txt',
    type: 'text/plain',
    size: minutes.length,
    createdAt: Date.parse('2026-10-19T01:00:00Z'),
    updatedAt: Date.parse('2026-10-19T01:05:00Z'),
    path: 'attachments/file_notes.txt',
  },
  {
    id: 'file_diagram',
    workspaceId: WS_ID,
    name: 'diagram.png',
    type: 'image/png',
    size: diagram.length,
    createdAt: Date.parse('2026-10-20T06:30:00Z'),
    updatedAt: Date.parse('2026-10-20T06:30:00Z'),
    path: 'attachments/file_diagram.png',
  },
];

function block({ slot, title, body, tags = [], prio = '', status = '', fileIds = [], end = '' }) {
  return {
    key: `${WS_ID}::${slot}`,
    slotKey: slot,
    workspaceId: WS_ID,
    title,
    body,
    tags,
    prio,
    status,
    loc: '',
    fileIds,
    startTime: slot.slice(slot.lastIndexOf('_') + 1),
    endTime: end,
    allDay: false,
    source: 'manual',
    externalId: '',
    updatedAt: Date.parse(`2026-10-${slot.slice(8, 10)}T02:00:00Z`),
    version: 6,
  };
}

const blocks = [
  block({
    slot: '2026-10-19_09:00',
    title: '整理季度报告',
    body: '汇总 Q3 数据，输出初稿并同步给团队。',
    tags: ['报告', '会议'],
    prio: '高',
    status: '已完成',
    fileIds: ['file_notes'],
    end: '10:30',
  }),
  block({
    slot: '2026-10-20_14:30',
    title: '与团队同步进度',
    body: '确认下周排期与阻塞项。',
    tags: ['会议'],
    status: '进行中',
    fileIds: ['file_diagram'],
    end: '15:30',
  }),
];

const manifest = {
  app: 'worklog',
  schema: 6,
  dataVersion: 2,
  exportedAt: EXPORTED_AT,
  exportId: 'sample-export-0001',
  appSettings: { theme: 'light', fontSize: 'medium', dataVersion: 2 },
  workspaces: [{ id: WS_ID, name: '示例工作区', isDefault: true, gran: 60, sh: 8, eh: 20, weekStart: 1, startDate: '2026-01-01' }],
  blocks,
  attachmentIdentity: 'uuid-v1',
  files,
};

const zip = writeZip([
  { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
  { name: 'attachments/file_notes.txt', data: minutes },
  { name: 'attachments/file_diagram.png', data: diagram },
]);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, zip);
process.stdout.write(
  `wrote ${outFile} (${zip.length} bytes, ${blocks.length} workblocks, ${files.length} attachments)\n`,
);
