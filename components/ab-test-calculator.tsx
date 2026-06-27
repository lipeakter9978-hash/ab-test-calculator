"use client";

import { FormEvent, useState } from "react";

type LiftType = "relative" | "absolute";

type Inputs = {
  baseline: string;
  lift: string;
  liftType: LiftType;
  confidence: string;
  power: string;
  totalGroups: string;
  controlGroups: string;
  dailyTraffic: string;
};

type Result = {
  perGroup: number;
  total: number;
  controlTotal: number;
  variantTotal: number;
  totalGroups: number;
  controlGroups: number;
  variantGroups: number;
  comparisons: number;
  adjustedConfidence: number;
  targetRate: number;
  absoluteLift: number;
  days: number | null;
};

const initialInputs: Inputs = {
  baseline: "8",
  lift: "10",
  liftType: "relative",
  confidence: "95",
  power: "80",
  totalGroups: "4",
  controlGroups: "2",
  dailyTraffic: "10000",
};

function inverseNormalCDF(probability: number) {
  // Peter J. Acklam 近似法：把概率转为标准正态分布 Z 值。
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687,
    138.357751867269, -30.66479806614716, 2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866,
    66.80131188771972, -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    0.007784695709041462, 0.3224671290700398, 2.445134137142996,
    3.754408661907416,
  ];
  const low = 0.02425;
  const high = 1 - low;

  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q +
        c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  if (probability > high) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q +
        c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  const q = probability - 0.5;
  const r = q * q;
  return (
    (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r +
      a[5]) *
    q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

function calculate(inputs: Inputs): Result {
  const baseline = Number(inputs.baseline) / 100;
  const lift = Number(inputs.lift) / 100;
  const confidence = Number(inputs.confidence);
  const power = Number(inputs.power);
  const totalGroups = Number(inputs.totalGroups);
  const controlGroups = Number(inputs.controlGroups);
  const variantGroups = totalGroups - controlGroups;
  const targetRate =
    inputs.liftType === "relative" ? baseline * (1 + lift) : baseline + lift;
  const absoluteLift = targetRate - baseline;

  if (
    !Number.isFinite(baseline) ||
    !Number.isFinite(lift) ||
    !Number.isFinite(confidence) ||
    !Number.isFinite(power) ||
    baseline <= 0 ||
    baseline >= 1 ||
    lift <= 0 ||
    targetRate >= 1 ||
    confidence <= 0 ||
    confidence >= 100 ||
    power <= 0 ||
    power >= 100 ||
    !Number.isInteger(totalGroups) ||
    !Number.isInteger(controlGroups) ||
    totalGroups < 2 ||
    totalGroups > 10 ||
    controlGroups < 1 ||
    controlGroups >= totalGroups
  ) {
    throw new Error("请输入有效参数：总组数 2–10，且至少保留 1 个实验组。");
  }

  const familywiseAlpha = 1 - confidence / 100;
  const comparisonAlpha = familywiseAlpha / variantGroups;
  const zAlpha = inverseNormalCDF(1 - comparisonAlpha / 2);
  const zBeta = inverseNormalCDF(power / 100);

  // 等流量分组：每个实验组都与“合并后的对照组”比较。
  const pooledRate = (controlGroups * baseline + targetRate) / (controlGroups + 1);
  const nullVariance = pooledRate * (1 - pooledRate) * (1 / controlGroups + 1);
  const alternativeVariance =
    (baseline * (1 - baseline)) / controlGroups + targetRate * (1 - targetRate);
  const perGroup = Math.ceil(
    Math.pow(
      zAlpha * Math.sqrt(nullVariance) +
        zBeta * Math.sqrt(alternativeVariance),
      2,
    ) / Math.pow(absoluteLift, 2),
  );
  const dailyTraffic = Number(inputs.dailyTraffic);

  return {
    perGroup,
    total: perGroup * totalGroups,
    controlTotal: perGroup * controlGroups,
    variantTotal: perGroup * variantGroups,
    totalGroups,
    controlGroups,
    variantGroups,
    comparisons: variantGroups,
    adjustedConfidence: (1 - comparisonAlpha) * 100,
    targetRate,
    absoluteLift,
    days:
      Number.isFinite(dailyTraffic) && dailyTraffic > 0
        ? Math.ceil((perGroup * totalGroups) / dailyTraffic)
        : null,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
        <span>{label}</span>
        {hint ? <span className="text-xs font-normal text-slate-400">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  suffix,
  min,
  max,
  step = "0.01",
}: {
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-20 text-base font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
      />
      {suffix ? (
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function ABTestCalculator() {
  const [inputs, setInputs] = useState(initialInputs);
  const [result, setResult] = useState<Result>(() => calculate(initialInputs));
  const [error, setError] = useState("");

  const setInput = <K extends keyof Inputs>(key: K, value: Inputs[K]) => {
    setInputs((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setResult(calculate(inputs));
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "计算失败，请检查输入。");
    }
  };

  const previewTotalGroups = Math.min(10, Math.max(2, Number(inputs.totalGroups) || 2));
  const previewControlGroups = Math.min(
    previewTotalGroups - 1,
    Math.max(1, Number(inputs.controlGroups) || 1),
  );
  const previewVariantGroups = previewTotalGroups - previewControlGroups;

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-slate-950 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <section className="mb-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <div className="mb-4 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            AB/n · 多对照 · 多重比较校正
          </div>
          <h1 className="text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">
            AB 实验样本量计算器
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-500">
            用于估算标准两比例实验所需样本量。支持 N 组实验：多个对照组合并计算，每个实验组分别与合并对照组比较，并用 Bonferroni 方法控制整体误报率。
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <form
            onSubmit={submit}
            className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">实验参数</h2>
                <p className="mt-1 text-sm text-slate-400">默认按各组等流量分配。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInputs(initialInputs);
                  setResult(calculate(initialInputs));
                  setError("");
                }}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 transition hover:border-blue-200 hover:text-blue-600"
              >
                恢复默认
              </button>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="基准转化率" hint="当前 A 版本">
                <NumberInput
                  value={inputs.baseline}
                  min="0.01"
                  max="99.99"
                  suffix="%"
                  onChange={(value) => setInput("baseline", value)}
                />
              </Field>

              <div>
                <Field label="期望提升幅度" hint="最小可检测效应">
                  <NumberInput
                    value={inputs.lift}
                    min="0.01"
                    suffix="%"
                    onChange={(value) => setInput("lift", value)}
                  />
                </Field>
                <div className="mt-2 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
                  {(["relative", "absolute"] as LiftType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setInput("liftType", type)}
                      className={`rounded-xl py-2 text-sm font-bold transition ${
                        inputs.liftType === type
                          ? "bg-white text-slate-950 shadow-sm"
                          : "text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      {type === "relative" ? "相对提升" : "绝对提升"}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="整体置信水平" hint="常用 95%">
                <NumberInput
                  value={inputs.confidence}
                  min="80"
                  max="99.9"
                  suffix="%"
                  onChange={(value) => setInput("confidence", value)}
                />
              </Field>

              <Field label="统计功效" hint="常用 80%">
                <NumberInput
                  value={inputs.power}
                  min="50"
                  max="99.9"
                  suffix="%"
                  onChange={(value) => setInput("power", value)}
                />
              </Field>

              <Field label="实验总组数 N" hint="2–10 组">
                <NumberInput
                  value={inputs.totalGroups}
                  min="2"
                  max="10"
                  step="1"
                  suffix="组"
                  onChange={(value) => setInput("totalGroups", value)}
                />
              </Field>

              <Field label="对照组数量" hint={`剩余 ${previewVariantGroups} 个实验组`}>
                <NumberInput
                  value={inputs.controlGroups}
                  min="1"
                  max="9"
                  step="1"
                  suffix="组"
                  onChange={(value) => setInput("controlGroups", value)}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="每日可用流量" hint="用于估算周期，可留空">
                  <NumberInput
                    value={inputs.dailyTraffic}
                    min="0"
                    step="1"
                    suffix="人 / 天"
                    onChange={(value) => setInput("dailyTraffic", value)}
                  />
                </Field>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-sm font-bold text-slate-700">分组结构预览</div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: previewControlGroups }, (_, index) => (
                  <span
                    key={`control-${index}`}
                    className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700"
                  >
                    对照 {index + 1}
                  </span>
                ))}
                {Array.from({ length: previewVariantGroups }, (_, index) => (
                  <span
                    key={`variant-${index}`}
                    className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700"
                  >
                    实验 {index + 1}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                多个对照组主要用于 A/A 一致性检查；它不能从根本上消除人群差异。若用户结构差异明显，优先使用分层随机。
              </p>
            </div>

            {error ? (
              <div className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              className="mt-6 h-12 w-full rounded-2xl bg-blue-600 text-base font-black text-white shadow-[0_12px_28px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 active:translate-y-px"
            >
              计算样本量
            </button>
          </form>

          <aside className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:p-8 lg:sticky lg:top-6">
            <div className="text-sm font-bold text-blue-200">估算结果</div>
            <div className="mt-5 text-sm text-slate-400">实验总样本量</div>
            <div className="mt-1 text-5xl font-black tracking-[-0.06em] sm:text-6xl">
              {formatNumber(result.total)}
            </div>
            <div className="mt-3 text-sm text-slate-400">
              {result.totalGroups} 组等流量，每组 {formatNumber(result.perGroup)} 人
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <ResultCard
                label="合并对照样本"
                value={formatNumber(result.controlTotal)}
                note={`${result.controlGroups} 个对照组`}
              />
              <ResultCard
                label="实验组总样本"
                value={formatNumber(result.variantTotal)}
                note={`${result.variantGroups} 个实验组`}
              />
            </div>

            <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <div className="mb-3 flex items-center justify-between gap-4 text-sm">
                <span className="font-bold text-slate-200">目标转化率</span>
                <span className="text-slate-400">
                  +{(result.absoluteLift * 100).toFixed(2)} 个百分点
                </span>
              </div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500">当前</div>
                  <div className="mt-1 text-2xl font-black">
                    {Number(inputs.baseline).toFixed(2)}%
                  </div>
                </div>
                <div className="pb-1 text-slate-500">→</div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">目标</div>
                  <div className="mt-1 text-2xl font-black text-emerald-300">
                    {(result.targetRate * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <div className="text-sm font-bold text-slate-200">多重比较</div>
              <div className="mt-3 text-sm leading-6 text-slate-400">
                共 {result.comparisons} 次主要比较；Bonferroni 校正后，单次比较置信水平约为{" "}
                <span className="font-bold text-white">
                  {result.adjustedConfidence.toFixed(2)}%
                </span>
                。
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <div className="text-sm font-bold text-slate-200">预计实验周期</div>
              <div className="mt-2 text-2xl font-black">
                {result.days ? `约 ${result.days} 天` : "未填写每日流量"}
              </div>
              {result.days ? (
                <div className="mt-1 text-sm text-slate-500">
                  约 {(result.days / 7).toFixed(1)} 周
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-3xl bg-blue-500/10 p-5 text-sm leading-6 text-blue-100/75">
              统计功效可以理解为：如果真实提升确实存在，实验有多大概率把它识别出来。功效越高，漏判好方案的概率越低，但需要的样本也越多。
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ResultCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
      <div className="text-xs font-bold text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}
