import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { eventLabels } from '../../constants/labels';
import type { EventItem } from '../../types';
import { Modal } from '../../components/Modal';

export default function Events({ events, onRefresh, setNotice }: { events: EventItem[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [phone, setPhone] = useState('18515385071');
  const [eventType, setEventType] = useState('user_register');
  const [modalOpen, setModalOpen] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = await api<{ matchedRuleCount: number }>('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        eventType,
        phone,
        userId: 'test-user',
        payload: { phone, source: 'operator-console' }
      })
    });
    setNotice(`事件已接收，匹配 ${result.matchedRuleCount} 条规则`);
    setModalOpen(false);
    await onRefresh();
  }

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <h2>事件流水</h2>
          <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><Zap size={16} />模拟事件</button>
        </div>
        <div className="eventList">
          {events.map((item) => (
            <div className="eventItem" key={item.id}>
              <strong>{eventLabels[item.eventType] || item.eventType}</strong>
              <span>{item.eventId} · {item.phone}</span>
            </div>
          ))}
        </div>
      </section>
      <Modal open={modalOpen} title="模拟业务事件" subtitle="自动规则触发" onClose={() => setModalOpen(false)}>
        <form className="formPanel" onSubmit={submit}>
          <label>事件类型
            <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
              {Object.entries(eventLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label>手机号<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          <button className="primaryButton" type="submit"><Zap size={16} />触发事件</button>
        </form>
      </Modal>
    </section>
  );
}

