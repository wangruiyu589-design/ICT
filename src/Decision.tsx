import { useState } from 'react';
import { ArrowRight, Calculator, CloudRain, Drop, Info, Leaf, SlidersHorizontal } from '@phosphor-icons/react';
import type { State, Zone } from './types';

interface DecisionProps {
  state: State;
  onIrrigate: (zone: Zone) => void;
  disabled?: boolean;
}

const growthStages = [
  { value: 'initial', label: '生长初期', kc: '0.60' },
  { value: 'development', label: '生长发展期', kc: '0.90' },
  { value: 'middle', label: '生长中期', kc: '1.15' },
  { value: 'late', label: '生长后期', kc: '0.80' },
  { value: 'custom', label: '自定义系数', kc: '' },
] as const;

const format = (value: number): string => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
const parseInput = (value: string): number => value.trim() === '' ? Number.NaN : Number(value);

export default function Decision({ state, onIrrigate, disabled = false }: DecisionProps) {
  const [zoneId, setZoneId] = useState(state.zones[0]?.id ?? '');
  const [stage, setStage] = useState<string>('middle');
  const [kcInput, setKcInput] = useState('1.15');
  const [et0Input, setEt0Input] = useState('4.2');
  const [rainInput, setRainInput] = useState('2');
  const [rainUseInput, setRainUseInput] = useState('80');
  const [efficiencyInput, setEfficiencyInput] = useState('85');

  const zone = state.zones.find(item => item.id === zoneId) ?? state.zones[0];
  const kc = parseInput(kcInput);
  const et0 = parseInput(et0Input);
  const rain = parseInput(rainInput);
  const rainUse = parseInput(rainUseInput);
  const efficiency = parseInput(efficiencyInput);
  const errors: string[] = [];
  if (!Number.isFinite(kc) || kc < 0 || kc > 2) errors.push('作物系数 Kc 需在 0～2 之间。');
  if (!Number.isFinite(et0) || et0 < 0 || et0 > 20) errors.push('参考蒸散 ET₀ 需在 0～20 mm / 天之间。');
  if (!Number.isFinite(rain) || rain < 0 || rain > 500) errors.push('预测降雨需在 0～500 mm 之间。');
  if (!Number.isFinite(rainUse) || rainUse < 0 || rainUse > 100) errors.push('有效降雨比例需在 0～100% 之间。');
  if (!Number.isFinite(efficiency) || efficiency < 1 || efficiency > 100) errors.push('灌溉效率需在 1～100% 之间。');
  if (zone && (!Number.isFinite(zone.area) || zone.area <= 0)) errors.push('分区面积需为大于 0 的有效数值。');

  const valid = !!zone && errors.length === 0;
  const etc = valid ? et0 * kc : 0;
  const effectiveRain = valid ? rain * rainUse / 100 : 0;
  const netNeed = valid ? Math.max(0, etc - effectiveRain) : 0;
  const grossDepth = valid ? netNeed / (efficiency / 100) : 0;
  const waterVolume = valid && zone ? grossDepth * zone.area * 666.667 / 1000 : 0;
  const canControl = !disabled && valid && netNeed > 0 && zone?.status === 'idle';
  const display = (value: number): string => valid ? format(value) : '—';

  function chooseStage(value: string): void {
    setStage(value);
    const choice = growthStages.find(item => item.value === value);
    if (choice?.kc) setKcInput(choice.kc);
  }

  if (!state.zones.length) {
    return <section className="panel"><div className="empty"><Leaf size={38} weight="light" /><h3>暂无可计算的灌溉分区</h3><p>配置分区与种植面积后，即可估算单日灌溉需水。</p></div></section>;
  }

  return <>
    <div className="summary-strip" aria-label="未来一天需水估算">
      <div><Leaf size={25} /><span>作物蒸散 ETc<strong>{display(etc)}<small>mm / 天</small></strong></span></div>
      <div><CloudRain size={25} /><span>预计有效降雨<strong>{display(effectiveRain)}<small>mm / 天</small></strong></span></div>
      <div><Drop size={25} /><span>建议灌溉水量<strong>{display(waterVolume)}<small>m³ / 天</small></strong></span></div>
    </div>

    <div className="settings-layout">
      <section className="panel settings-form">
        <div className="panel-heading"><div><h2>单日需水估算</h2><p>调整参数，查看未来 1 天的用水需求</p></div><SlidersHorizontal size={22} color="#2f70e8" /></div>
        <div className="settings-fields">
          <label className="field">灌溉分区
            <select value={zone?.id ?? ''} onChange={event => setZoneId(event.target.value)}>
              {state.zones.map(item => <option key={item.id} value={item.id}>{item.name} · {item.crop} · {format(item.area)} 亩</option>)}
            </select>
          </label>
          <div className="form-row">
            <label className="field">作物生育阶段
              <select value={stage} onChange={event => chooseStage(event.target.value)}>{growthStages.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            </label>
            <label className="field">作物系数 Kc
              <input type="number" inputMode="decimal" min="0" max="2" step="0.01" value={kcInput} onChange={event => { setKcInput(event.target.value); setStage('custom'); }} aria-describedby="kc-hint" />
            </label>
          </div>
          <p className="muted" id="kc-hint" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.7 }}>阶段系数为通用演示值，未按当前作物和地区标定；切换分区后，请核对生育期和 Kc。</p>
          <div className="form-row">
            <label className="field">参考蒸散 ET₀（mm / 天）
              <input type="number" inputMode="decimal" min="0" max="20" step="0.1" value={et0Input} onChange={event => setEt0Input(event.target.value)} />
            </label>
            <label className="field">未来 1 天预测降雨（mm）
              <input type="number" inputMode="decimal" min="0" max="500" step="0.1" value={rainInput} onChange={event => setRainInput(event.target.value)} />
            </label>
          </div>
          <div className="form-row">
            <label className="field">有效降雨比例（%）
              <input type="number" inputMode="decimal" min="0" max="100" step="1" value={rainUseInput} onChange={event => setRainUseInput(event.target.value)} />
            </label>
            <label className="field">灌溉效率（%）
              <input type="number" inputMode="decimal" min="1" max="100" step="1" value={efficiencyInput} onChange={event => setEfficiencyInput(event.target.value)} />
            </label>
          </div>
          <div className="info-box"><Info size={20} style={{ flexShrink: 0 }} /><span>ET₀ 与降雨由你输入，初始值仅用于演示。有效降雨按固定利用比例简化估算，暂未接入实时气象。</span></div>
          {errors.length > 0 && <div className="form-error" role="alert">{errors.map(error => <p key={error} style={{ margin: '4px 0' }}>{error}</p>)}</div>}
        </div>
      </section>

      <aside style={{ minWidth: 0 }}>
        <section className="panel connection-panel">
          <span className="soft-icon"><Calculator size={27} /></span>
          <h2>本次估算结果</h2>
          <p>{zone?.name} · {zone?.crop} · {zone ? format(zone.area) : '—'} 亩</p>
          <div aria-live="polite" aria-atomic="true" style={{ padding: '14px 0 18px' }}>
            <span style={{ display: 'block', color: '#75859b', fontSize: 12 }}>未来 1 天建议水量</span>
            <strong style={{ display: 'block', color: '#2567df', fontSize: 40, fontWeight: 650, lineHeight: 1.4, letterSpacing: '-1.5px', overflowWrap: 'anywhere' }}>{display(waterVolume)}<small style={{ fontSize: 15, letterSpacing: 0, fontWeight: 500, marginLeft: 8 }}>m³</small></strong>
            <span style={{ fontSize: 12, color: '#75859b' }}>计入灌溉效率后的取水量</span>
          </div>
          <dl>
            <div><dt>净灌溉需水</dt><dd>{display(netNeed)} mm</dd></div>
            <div><dt>毛灌溉水深</dt><dd>{display(grossDepth)} mm</dd></div>
            <div><dt>分区状态</dt><dd>{zone?.status === 'offline' ? '设备离线' : zone?.status === 'watering' ? '正在灌溉' : '待机'}</dd></div>
          </dl>
          <button className="button primary" type="button" disabled={!canControl} onClick={() => { if (canControl && zone) onIrrigate(zone); }} style={{ width: '100%', marginTop: 20 }}><Drop size={17} />打开灌溉控制<ArrowRight size={16} /></button>
          <p style={{ fontSize: 12, lineHeight: 1.8, marginBottom: 0 }}>
            {!valid ? '完善有效参数后，即可查看建议。' : netNeed === 0 ? '按当前简化计算，有效降雨已覆盖当日蒸散，暂无新增补水建议。' : zone?.status === 'offline' ? '该分区设备离线，恢复连接后可打开灌溉控制。' : zone?.status === 'watering' ? '该分区正在灌溉，请先在分区页面查看当前任务。' : '下一步手动核对灌溉时长。此按钮只打开控制面板，不会下发设备指令。'}
          </p>
        </section>
        <div className="page-note" style={{ alignItems: 'flex-start', lineHeight: 1.8 }}><Info size={16} style={{ flexShrink: 0, marginTop: 3 }} /><span>采用透明规则辅助计算，未使用训练模型。土壤墒情百分比未参与水层深度计算。</span></div>
      </aside>
    </div>

    <section className="panel" style={{ marginTop: 22 }}>
      <div className="panel-heading"><div><h2>每一步，都可以核对</h2><p>统一以未来 1 天为计算周期 · 1 亩 = 666.667 m²</p></div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 24, padding: '0 24px 24px' }}>
        {[
          { title: '01 / 作物蒸散', formula: 'ETc = ET₀ × Kc', detail: valid ? `${format(et0)} × ${format(kc)} = ${format(etc)} mm` : '等待有效输入' },
          { title: '02 / 有效降雨', formula: 'Pe = 预测降雨 × 利用比例', detail: valid ? `${format(rain)} × ${format(rainUse)}% = ${format(effectiveRain)} mm` : '等待有效输入' },
          { title: '03 / 净需水', formula: 'N = max(0, ETc − Pe)', detail: valid ? `max(0, ${format(etc)} − ${format(effectiveRain)}) = ${format(netNeed)} mm` : '等待有效输入' },
          { title: '04 / 灌溉水量', formula: 'V = N ÷ 效率 × 面积 × 666.667 ÷ 1000', detail: valid && zone ? `${format(netNeed)} ÷ ${format(efficiency)}% × ${format(zone.area)} × 666.667 ÷ 1000 = ${format(waterVolume)} m³` : '等待有效输入' },
        ].map(item => <div key={item.title} style={{ minWidth: 0 }}><span style={{ fontSize: 12, color: '#2f70e8' }}>{item.title}</span><p style={{ color: '#253f5c', fontWeight: 600, fontSize: 13, lineHeight: 1.8, margin: '9px 0 6px' }}>{item.formula}</p><p style={{ color: '#75859b', fontSize: 12, lineHeight: 1.8, margin: 0, overflowWrap: 'anywhere' }}>{item.detail}</p></div>)}
      </div>
    </section>
    <div className="page-note"><Info size={16} style={{ flexShrink: 0 }} /><span>此结果仅估算当日新增耗水，未计入前期土壤缺水、根区蓄水、渗漏与灌排平衡。实际方案需结合田间监测核对。</span></div>
  </>;
}
