// Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soSanhHoiVien } from '../src/lib/thu-tu.ts';

const hv = (hoTen: string, capBac: string, thuTu = 9999) => ({ data: { hoTen, capBac, thuTu } });
const xep = (ds: ReturnType<typeof hv>[]) => [...ds].sort(soSanhHoiVien).map((m) => m.data.hoTen);

test('chức vụ quyết định thứ tự, không phụ thuộc số thứ tự', () => {
  const ds = [
    hv('Uỷ viên nhập nhầm số nhỏ', 'uy-vien', 12),
    hv('Hội viên', ''),
    hv('Dự khuyết', 'uy-vien-du-khuyet', 1),
    hv('Phó Chủ tịch Danh dự', 'pho-chu-tich-danh-du', 408),
    hv('Phó Chủ tịch', 'pho-chu-tich', 5),
    hv('Phó Chủ tịch Thường trực', 'pho-chu-tich-thuong-truc', 201),
    hv('Chủ tịch', 'chu-tich', 100),
  ];
  assert.deepEqual(xep(ds), [
    'Chủ tịch',
    'Phó Chủ tịch Thường trực',
    'Phó Chủ tịch',
    'Phó Chủ tịch Danh dự',
    'Uỷ viên nhập nhầm số nhỏ',
    'Dự khuyết',
    'Hội viên',
  ]);
});

test('trong cùng chức vụ thì theo số thứ tự, bằng nhau thì theo tên', () => {
  const ds = [hv('Bình', 'uy-vien', 511), hv('An', 'uy-vien', 511), hv('Cường', 'uy-vien', 509)];
  assert.deepEqual(xep(ds), ['Cường', 'An', 'Bình']);
});

test('hội viên không có chức vụ xếp sau Ban điều hành dù có số thứ tự nhỏ', () => {
  const ds = [hv('Hội viên', '', 1), hv('Uỷ viên', 'uy-vien', 509)];
  assert.deepEqual(xep(ds), ['Uỷ viên', 'Hội viên']);
});
