import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { eventLabels } from '../../constants/labels';
import type { EventItem } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { AuthC } from '../../lib/auth';

export default function Events({ events, onRefresh, setNotice }: { events: EventItem[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [phone, setPhone] = useState('18515385071');
  const [eventType, setEventType] = useState('user_register');
  const [modalOpen, setModalOpen] = useState(false);
  const eventOptions = Object.entries(eventLabels).map(([value, label]) => ({ value, label }));

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
          <AuthC authKey="touch:event:simulate">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><Zap size={16} />模拟事件</button>
          </AuthC>
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
      <Modal open={modalOpen} title="模拟业务事件" subtitle="自动规则触发" onClose={() => setModalOpen(false)} showClose={false}>
        <form className="formPanel" onSubmit={submit}>
          <label>事件类型
            <SelectField value={eventType} options={eventOptions} onChange={setEventType} />
          </label>
          <label>手机号<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(false)}>取消</button>
            <button className="primaryButton compact" type="submit">触发</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
