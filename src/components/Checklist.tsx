export const CHECK_ITEMS = ['停留所・乗り場', '対象期間', '運行日（適用日）', '行先', '時刻', '注記'];

type Props = {
  checkedItems: string[];
  onToggle: (item: string) => void;
};

export function Checklist({ checkedItems, onToggle }: Props) {
  return (
    <fieldset className="checklist">
      <legend>運行情報と照合し、確認した項目にチェックしてください</legend>
      {CHECK_ITEMS.map((item) => (
        <label key={item} className="block">
          <input type="checkbox" checked={checkedItems.includes(item)} onChange={() => onToggle(item)} /> {item}
        </label>
      ))}
      <p className="hint">確認チェックは操作の補助であり、承認記録ではありません。内容を変更するとチェックは解除されます。</p>
    </fieldset>
  );
}