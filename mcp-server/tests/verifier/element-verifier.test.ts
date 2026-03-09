import { describe, it, expect } from '@jest/globals';
import {
  verifyElement,
  verifyAllElements,
  formatVerificationTable,
  type VerifyElement,
} from '../../src/verifier/element-verifier.js';

function createElement(overrides: Partial<VerifyElement> = {}): VerifyElement {
  return {
    name: 'Test Element',
    figmaNodeId: '1:1',
    figmaProps: { exists: true },
    renderedProps: { exists: true },
    ...overrides,
  };
}

describe('verifyElement', () => {
  it('존재하지 않는 요소는 pass 0/1', () => {
    const el = createElement({
      figmaProps: { exists: true },
      renderedProps: { exists: false },
    });
    const result = verifyElement(el, 1);
    expect(result.passCount).toBe(0);
    expect(result.totalCount).toBe(1);
  });

  it('존재하는 요소에 해당 속성이 없으면 notApplicable로 분모에서 제외', () => {
    const el = createElement({
      figmaProps: { exists: true },
      renderedProps: { exists: true },
    });
    const result = verifyElement(el, 1);
    // existence만 applicable (나머지 8개는 figmaProps에 해당 속성이 없으므로 notApplicable)
    expect(result.totalCount).toBe(1);
    expect(result.passCount).toBe(1);
  });

  it('배치가 일치하면 pass', () => {
    const el = createElement({
      figmaProps: {
        exists: true,
        layout: { direction: 'row', alignItems: 'center', justifyContent: 'flex-start' },
      },
      renderedProps: {
        exists: true,
        layout: { direction: 'row', alignItems: 'center', justifyContent: 'flex-start' },
      },
    });
    const result = verifyElement(el, 1);
    const layoutCheck = result.checks.find(c => c.category === 'layout');
    expect(layoutCheck?.passed).toBe(true);
  });

  it('배치가 불일치하면 fail', () => {
    const el = createElement({
      figmaProps: {
        exists: true,
        layout: { direction: 'row' },
      },
      renderedProps: {
        exists: true,
        layout: { direction: 'column' },
      },
    });
    const result = verifyElement(el, 1);
    const layoutCheck = result.checks.find(c => c.category === 'layout');
    expect(layoutCheck?.passed).toBe(false);
  });

  it('간격이 허용 오차(±1px) 이내면 pass', () => {
    const el = createElement({
      figmaProps: {
        exists: true,
        spacing: { gap: 12, padding: { top: 8, right: 16, bottom: 8, left: 16 } },
      },
      renderedProps: {
        exists: true,
        spacing: { gap: 12, padding: { top: 9, right: 16, bottom: 8, left: 15 } },
      },
    });
    const result = verifyElement(el, 1);
    const spacingCheck = result.checks.find(c => c.category === 'spacing');
    expect(spacingCheck?.passed).toBe(true);
  });

  it('간격이 허용 오차를 초과하면 fail', () => {
    const el = createElement({
      figmaProps: {
        exists: true,
        spacing: { gap: 12 },
      },
      renderedProps: {
        exists: true,
        spacing: { gap: 16 },
      },
    });
    const result = verifyElement(el, 1);
    const spacingCheck = result.checks.find(c => c.category === 'spacing');
    expect(spacingCheck?.passed).toBe(false);
  });

  it('색상이 정확히 일치하면 pass', () => {
    const el = createElement({
      figmaProps: {
        exists: true,
        color: { background: '#ffffff', text: '#000000' },
      },
      renderedProps: {
        exists: true,
        color: { background: '#ffffff', text: '#000000' },
      },
    });
    const result = verifyElement(el, 1);
    const colorCheck = result.checks.find(c => c.category === 'color');
    expect(colorCheck?.passed).toBe(true);
  });

  it('색상이 다르면 fail', () => {
    const el = createElement({
      figmaProps: {
        exists: true,
        color: { background: '#ffffff' },
      },
      renderedProps: {
        exists: true,
        color: { background: '#f0f0f0' },
      },
    });
    const result = verifyElement(el, 1);
    const colorCheck = result.checks.find(c => c.category === 'color');
    expect(colorCheck?.passed).toBe(false);
  });

  it('테두리 스타일(solid/dashed) 불일치를 감지한다', () => {
    const el = createElement({
      figmaProps: {
        exists: true,
        border: { width: 1, radius: 8, style: 'dashed' },
      },
      renderedProps: {
        exists: true,
        border: { width: 1, radius: 8, style: 'solid' },
      },
    });
    const result = verifyElement(el, 1);
    const borderCheck = result.checks.find(c => c.category === 'border');
    expect(borderCheck?.passed).toBe(false);
  });

  it('아이콘 이름이 다르면 fail', () => {
    const el = createElement({
      figmaProps: {
        exists: true,
        icon: { name: 'check-circle', containerSize: { width: 28, height: 28 }, shapeSize: { width: 18, height: 18 } },
      },
      renderedProps: {
        exists: true,
        icon: { name: 'close', containerSize: { width: 28, height: 28 }, shapeSize: { width: 18, height: 18 } },
      },
    });
    const result = verifyElement(el, 1);
    const iconCheck = result.checks.find(c => c.category === 'icon');
    expect(iconCheck?.passed).toBe(false);
  });
});

describe('verifyAllElements', () => {
  it('전체 요소 목록을 검증하고 정확도를 계산한다', () => {
    const elements: VerifyElement[] = [
      createElement({ name: '요소 A' }),
      createElement({
        name: '요소 B',
        figmaProps: { exists: true },
        renderedProps: { exists: false },
      }),
    ];
    const report = verifyAllElements('1:1', 'TestNode', elements);
    expect(report.elements.length).toBe(2);
    expect(report.totalPass).toBe(1);
    expect(report.totalChecks).toBe(2);
    expect(report.accuracy).toBe(50);
  });

  it('모든 요소가 pass이면 accuracy=100', () => {
    const elements: VerifyElement[] = [
      createElement({ name: '요소 A' }),
      createElement({ name: '요소 B' }),
    ];
    const report = verifyAllElements('1:1', 'TestNode', elements);
    expect(report.accuracy).toBe(100);
  });

  it('빈 요소 목록이면 accuracy=0', () => {
    const report = verifyAllElements('1:1', 'TestNode', []);
    expect(report.accuracy).toBe(0);
    expect(report.totalChecks).toBe(0);
  });
});

describe('formatVerificationTable', () => {
  it('검증 테이블 문자열을 생성한다', () => {
    const elements: VerifyElement[] = [
      createElement({ name: '드래그 핸들' }),
    ];
    const report = verifyAllElements('1:1', '정렬 모달', elements);
    const table = formatVerificationTable(report, 1, 'Storybook');
    expect(table).toContain('[검증 테이블] 라운드 1');
    expect(table).toContain('정렬 모달');
    expect(table).toContain('드래그 핸들');
    expect(table).toContain('Storybook');
  });
});
