// @ts-expect-error React is provided by the application runtime, without local type declarations.
import { createElement } from 'react';

export const CHECK_ITEMS = ['停留所・乗り場', '対象期間', '運行日（適用日）', '行先', '時刻', '注記'];

type Props = {
  checkedItems: string[];
  onToggle: (item: string) => void;
};

export function Checklist({ checkedItems, onToggle }: Props) {
  return createElement(
    'fieldset',
    { className: 'checklist' },
    createElement('legend', null, '運行情報と照合し、確認した項目にチェックしてください'),
    ...CHECK_ITEMS.map((item) =>
      createElement(
        'label',
        { key: item, className: 'block' },
        createElement('input', {
          type: 'checkbox',
          checked: checkedItems.includes(item),
          onChange: () => onToggle(item),
        }),
        ` ${item}`,
      ),
    ),
    createElement(
      'p',
      { className: 'hint' },
      '確認チェックは操作の補助であり、承認記録ではありません。内容を変更するとチェックは解除されます。',
    ),
  );
}