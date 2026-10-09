const { parsePagination, buildPagination } = require('../../src/shared/utils/pagination');

describe('parsePagination', () => {
  it('is NOT paged when neither page nor limit is sent (backward compatible)', () => {
    const r = parsePagination({});
    expect(r.paged).toBe(false);
    expect(r.page).toBe(1);
    expect(r.limit).toBe(20);
    expect(r.skip).toBe(0);
    expect(r.take).toBe(20);
  });

  it('opts into paging when only limit is sent', () => {
    const r = parsePagination({ limit: '10' });
    expect(r.paged).toBe(true);
    expect(r.limit).toBe(10);
    expect(r.take).toBe(10);
    expect(r.skip).toBe(0);
  });

  it('opts into paging when only page is sent', () => {
    const r = parsePagination({ page: '2' });
    expect(r.paged).toBe(true);
    expect(r.page).toBe(2);
    expect(r.skip).toBe(20); // (2-1) * default 20
  });

  it('computes skip from page and limit', () => {
    const r = parsePagination({ page: '3', limit: '15' });
    expect(r.skip).toBe(30); // (3-1) * 15
    expect(r.take).toBe(15);
  });

  it('clamps limit to maxLimit (default 50)', () => {
    const r = parsePagination({ limit: '1000' });
    expect(r.limit).toBe(50);
    expect(r.take).toBe(50);
  });

  it('honors a custom maxLimit', () => {
    const r = parsePagination({ limit: '1000' }, { maxLimit: 100 });
    expect(r.limit).toBe(100);
  });

  it('falls back to defaults for garbage/negative input', () => {
    expect(parsePagination({ page: 'abc', limit: 'xyz' }).page).toBe(1);
    expect(parsePagination({ page: '-5' }).page).toBe(1);
    expect(parsePagination({ limit: '0' }).limit).toBe(20);
    expect(parsePagination({ limit: '-3' }).limit).toBe(20);
  });

  it('honors a custom defaultLimit', () => {
    const r = parsePagination({ page: '1' }, { defaultLimit: 25 });
    expect(r.limit).toBe(25);
  });
});

describe('buildPagination', () => {
  it('reports hasNext=true when more pages remain', () => {
    const p = buildPagination(1, 20, 45);
    expect(p).toEqual({ page: 1, limit: 20, total: 45, hasNext: true });
  });

  it('reports hasNext=false on the last page', () => {
    expect(buildPagination(3, 20, 45).hasNext).toBe(false); // 3*20=60 >= 45
  });

  it('reports hasNext=false on an exact boundary', () => {
    expect(buildPagination(2, 20, 40).hasNext).toBe(false); // 2*20=40, not < 40
  });

  it('coerces a non-finite total to 0', () => {
    const p = buildPagination(1, 20, undefined);
    expect(p.total).toBe(0);
    expect(p.hasNext).toBe(false);
  });
});
