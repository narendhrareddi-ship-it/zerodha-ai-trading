const TELEGRAM_API = 'https://api.telegram.org/bot';

function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? '';
}

async function telegramRequest(method: string, params: Record<string, any>) {
  const token = getBotToken();
  if (!token) {
    console.warn('[Telegram] No bot token configured');
    return null;
  }
  try {
    const res = await fetch(`${TELEGRAM_API}${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!data?.ok) {
      console.error(`[Telegram] API error: ${data?.description ?? 'unknown'}`);
    }
    return data;
  } catch (err: any) {
    console.error(`[Telegram] Request failed: ${err?.message}`);
    return null;
  }
}

export async function sendTelegramMessage(chatId: string, text: string, parseMode: string = 'HTML') {
  if (!chatId) return null;
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: true,
  });
}

export async function verifyTelegramChatId(chatId: string): Promise<boolean> {
  const result = await sendTelegramMessage(
    chatId,
    '✅ <b>H.E.R.M.E.S. Trading Bot Connected!</b>\n\nYou will now receive trading notifications here.'
  );
  return result?.ok === true;
}

export async function getRecentChatId(): Promise<string | null> {
  const token = getBotToken();
  if (!token) return null;
  try {
    const res = await fetch(`${TELEGRAM_API}${token}/getUpdates?limit=5&offset=-5`);
    const data = await res.json();
    if (data?.ok && data?.result?.length > 0) {
      const lastMsg = data.result[data.result.length - 1];
      return String(lastMsg?.message?.chat?.id ?? lastMsg?.my_chat_member?.chat?.id ?? '');
    }
    return null;
  } catch (err: any) {
    console.error(`[Telegram] getUpdates failed: ${err?.message}`);
    return null;
  }
}

// ---- Trading notification formatters ----

export function formatTradeEntry(signal: any): string {
  const type = signal?.action === 'BUY' ? '🟢 BUY' : '🔴 SELL';
  return [
    `📊 <b>Trade Entry Signal</b>`,
    ``,
    `${type} <b>${signal?.symbol ?? 'N/A'}</b>`,
    `Strategy: <code>${signal?.strategy ?? 'N/A'}</code>`,
    `Price: ₹${(signal?.price ?? 0).toFixed(2)}`,
    `Confidence: ${((signal?.confidence ?? 0) * 100).toFixed(0)}%`,
    signal?.reason ? `Reason: ${signal.reason}` : '',
    ``,
    `⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
  ].filter(Boolean).join('\n');
}

export function formatTradeExit(trade: any): string {
  const pnl = trade?.pnl ?? 0;
  const emoji = pnl >= 0 ? '✅' : '❌';
  return [
    `${emoji} <b>Trade Closed</b>`,
    ``,
    `Symbol: <b>${trade?.symbol ?? 'N/A'}</b>`,
    `Entry: ₹${(trade?.entryPrice ?? 0).toFixed(2)}`,
    `Exit: ₹${(trade?.exitPrice ?? 0).toFixed(2)}`,
    `P&L: <b>${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}</b>`,
    `Reason: ${trade?.exitReason ?? 'N/A'}`,
    ``,
    `⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
  ].filter(Boolean).join('\n');
}

export function formatDailyPnl(data: any): string {
  const pnl = data?.totalPnl ?? 0;
  const emoji = pnl >= 0 ? '📈' : '📉';
  return [
    `${emoji} <b>Daily P&L Summary</b>`,
    ``,
    `Total P&L: <b>${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}</b>`,
    `Trades: ${data?.totalTrades ?? 0}`,
    `Win Rate: ${(data?.winRate ?? 0).toFixed(1)}%`,
    `Open Positions: ${data?.openPositions ?? 0}`,
    ``,
    `Capital: ₹${(data?.capital ?? 10000).toFixed(0)}`,
    `Max Loss Limit: ₹${data?.maxDailyLoss ?? 500}`,
    ``,
    `⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
  ].join('\n');
}

export function formatRiskAlert(data: any): string {
  return [
    `🚨 <b>RISK ALERT</b>`,
    ``,
    `${data?.message ?? 'Risk limit triggered'}`,
    ``,
    `Daily Loss: ₹${(data?.dailyLoss ?? 0).toFixed(2)}`,
    `Limit: ₹${data?.limit ?? 500}`,
    `Action: ${data?.action ?? 'Bot stopped'}`,
    ``,
    `⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
  ].join('\n');
}
