(function() {
  let activeRecordId = null;

  // Track clicked row ID in the table
  document.addEventListener('click', function(e) {
    const tr = e.target.closest('tr');
    if (tr) {
      const firstCell = tr.querySelector('td');
      if (firstCell && /^\d+$/.test(firstCell.innerText.trim())) {
        activeRecordId = firstCell.innerText.trim();
      }
    }
  }, true);

  // Monitor DOM for Detail Panel rendering
  const observer = new MutationObserver(function() {
    // 1. Inject in Request Panel (near copy as CURL)
    const links = document.querySelectorAll('a');
    links.forEach(function(a) {
      if (a.innerText && a.innerText.indexOf('copy as CURL') !== -1) {
        if (!a.dataset.hasComposerBtn) {
          a.dataset.hasComposerBtn = 'true';
          
          // Button: Sửa & Gửi lại Request
          const btnReq = document.createElement('button');
          btnReq.innerHTML = '⚡ Sửa & Gửi lại (Composer)';
          btnReq.title = 'Sửa Header/Body của Request và gửi lại lên Server';
          btnReq.style.cssText = 'margin-left: 12px; background: #38bdf8; color: #0f172a; border: none; padding: 4px 10px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);';
          btnReq.onclick = function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            openQuickComposer(activeRecordId);
          };

          // Button: Sửa Response Body (Mock)
          const btnRes = document.createElement('button');
          btnRes.innerHTML = '🎭 Sửa Response Body (Mock)';
          btnRes.title = 'Lưu Response đã sửa vào Data để tự động trả về cho App/Robot';
          btnRes.style.cssText = 'margin-left: 8px; background: #a855f7; color: #ffffff; border: none; padding: 4px 10px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);';
          btnRes.onclick = function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            openResponseMockModal(activeRecordId);
          };

          a.parentNode.appendChild(btnReq);
          a.parentNode.appendChild(btnRes);
        }
      }
    });

    // 2. Inject in Response Panel
    const sections = document.querySelectorAll('.record-detail_section__1t3k7, [class*="section"]');
    sections.forEach(function(sec) {
      const titleSpan = sec.querySelector('span');
      if (titleSpan && titleSpan.innerText && titleSpan.innerText.trim() === 'Status Code') {
        if (!sec.dataset.hasMockBtn) {
          sec.dataset.hasMockBtn = 'true';
          const mockBtn = document.createElement('button');
          mockBtn.innerHTML = '🎭 Sửa Response Body Này';
          mockBtn.style.cssText = 'margin-left: 14px; background: #a855f7; color: #ffffff; border: none; padding: 3px 10px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 11px;';
          mockBtn.onclick = function() { openResponseMockModal(activeRecordId); };
          titleSpan.parentNode.appendChild(mockBtn);
        }
      }
    });

    // 3. Add Top Navigation Button: "📋 Quản lý Mock Rules"
    if (!document.getElementById('top-btn-mock-rules')) {
      const topBtn = document.createElement('button');
      topBtn.id = 'top-btn-mock-rules';
      topBtn.innerHTML = '📋 Quản Lý Rules (Mock / File .JS)';
      topBtn.style.cssText = 'position:fixed;top:10px;right:420px;z-index:99999;background:#a855f7;color:#ffffff;border:none;padding:7px 14px;border-radius:6px;font-weight:bold;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:system-ui,sans-serif;font-size:13px;display:flex;align-items:center;gap:6px;';
      topBtn.onclick = function() { openRulesListModal(); };
      document.body.appendChild(topBtn);
      updateRuleCount();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  async function updateRuleCount() {
    try {
      const res = await fetch('/api/composer/rules');
      const rules = await res.json();
      const badge = document.getElementById('mock-count-badge');
      if (badge && Array.isArray(rules)) {
        const activeCount = rules.filter(r => r.enabled).length;
        badge.textContent = activeCount + '/' + rules.length;
      }
    } catch(e) {}
  }

  // -------------------------------------------------------------
  // MODAL 1: Quick Composer (Sửa Request & Gửi lại)
  // -------------------------------------------------------------
  function getComposerModal() {
    let modal = document.getElementById('quick-composer-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'quick-composer-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:999999;display:none;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
    
    modal.innerHTML = `
      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;width:92%;max-width:1100px;max-height:92vh;display:flex;flex-direction:column;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
        
        <div style="padding:12px 20px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:10px;">
            <strong style="font-size:16px;color:#38bdf8;">⚡ Sửa Request & Gửi lại lên Server</strong>
            <span id="qc-record-label" style="background:#334155;padding:2px 8px;border-radius:4px;font-size:12px;color:#94a3b8;">Request #</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <a id="qc-full-link" href="/composer" target="_blank" style="color:#38bdf8;font-size:13px;text-decoration:none;">↗️ Tab Composer</a>
            <button onclick="document.getElementById('quick-composer-modal').style.display='none'" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;line-height:1;">✕</button>
          </div>
        </div>

        <div style="padding:16px 20px;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          
          <!-- Left -->
          <div>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
              <select id="qc-method" style="background:#334155;color:#38bdf8;font-weight:bold;border:1px solid #475569;border-radius:6px;padding:8px 10px;width:95px;">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
              <input id="qc-url" type="text" placeholder="https://..." style="flex:1;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f8fafc;padding:8px 12px;font-family:monospace;font-size:13px;">
              <button id="qc-send-btn" onclick="sendQuickRequest()" style="background:#38bdf8;color:#0f172a;font-weight:bold;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;">🚀 Gửi</button>
            </div>

            <div style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;color:#94a3b8;font-weight:bold;margin-bottom:4px;text-transform:uppercase;">Request Headers (JSON)</label>
              <textarea id="qc-headers" rows="6" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f8fafc;padding:8px 10px;font-family:monospace;font-size:12px;"></textarea>
            </div>

            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <label style="font-size:12px;color:#94a3b8;font-weight:bold;text-transform:uppercase;">Request Body</label>
                <button onclick="formatQuickBody()" style="background:#334155;color:#f8fafc;border:none;padding:2px 8px;border-radius:4px;font-size:11px;cursor:pointer;">✨ Prettify JSON</button>
              </div>
              <textarea id="qc-body" rows="9" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f8fafc;padding:8px 10px;font-family:monospace;font-size:12px;"></textarea>
            </div>
          </div>

          <!-- Right -->
          <div style="display:flex;flex-direction:column;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;background:#0f172a;padding:8px 12px;border-radius:6px;border:1px solid #334155;">
              <div>Status: <strong id="qc-res-status" style="color:#38bdf8;">-</strong></div>
              <div>Thời gian: <strong id="qc-res-time">-</strong></div>
              <div>Kích thước: <strong id="qc-res-size">-</strong></div>
            </div>

            <div style="flex:1;display:flex;flex-direction:column;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <label style="font-size:12px;color:#94a3b8;font-weight:bold;text-transform:uppercase;">Response Body nhận được</label>
                <div style="display:flex;gap:6px;">
                  <button onclick="copyQuickResponse()" style="background:#334155;color:#f8fafc;border:none;padding:2px 8px;border-radius:4px;font-size:11px;cursor:pointer;">📋 Copy</button>
                  <button onclick="mockFromCurrentResponse()" style="background:#a855f7;color:white;border:none;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;">🎭 Sửa Response này thành Mock</button>
                </div>
              </div>
              <pre id="qc-res-body" style="flex:1;min-height:280px;max-height:340px;background:#090d16;border:1px solid #334155;border-radius:6px;padding:12px;color:#e2e8f0;font-family:monospace;font-size:12px;overflow:auto;white-space:pre-wrap;word-break:break-all;">(Bấm nút "🚀 Gửi" ở bên trái để chạy request)</pre>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  // -------------------------------------------------------------
  // MODAL 2: Sửa & Mock Response Body (Tạo Rule mới)
  // -------------------------------------------------------------
  function getMockModal() {
    let modal = document.getElementById('mock-response-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'mock-response-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999999;display:none;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
    
    modal.innerHTML = `
      <div style="background:#1e293b;border:1px solid #475569;border-radius:12px;width:90%;max-width:850px;max-height:92vh;display:flex;flex-direction:column;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);">
        
        <div style="padding:14px 20px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;background:#111827;border-radius:12px 12px 0 0;">
          <div style="display:flex;align-items:center;gap:10px;">
            <strong style="font-size:16px;color:#c084fc;">🎭 Sửa Response Body (Lưu vào Data tự động trả về)</strong>
          </div>
          <button onclick="document.getElementById('mock-response-modal').style.display='none'" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;line-height:1;">✕</button>
        </div>

        <div style="padding:18px 20px;overflow-y:auto;">
          
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;color:#94a3b8;font-weight:bold;margin-bottom:4px;">TÊN RULE GỢI NHỚ</label>
            <input id="mock-rule-name" type="text" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f8fafc;padding:8px 12px;font-size:13px;" placeholder="Ví dụ: Sửa thông tin Robot">
          </div>

          <div style="display:grid;grid-template-columns:3fr 1fr;gap:12px;margin-bottom:12px;">
            <div>
              <label style="display:block;font-size:12px;color:#94a3b8;font-weight:bold;margin-bottom:4px;">URL CẦN KHỚP ĐỂ TỰ ĐỘNG SỬA RESPONSE (Pattern)</label>
              <input id="mock-url-pattern" type="text" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f8fafc;padding:8px 12px;font-family:monospace;font-size:13px;">
            </div>
            <div>
              <label style="display:block;font-size:12px;color:#94a3b8;font-weight:bold;margin-bottom:4px;">MÃ STATUS</label>
              <input id="mock-status-code" type="number" value="200" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f8fafc;padding:8px 12px;font-size:13px;">
            </div>
          </div>

          <!-- IF - ELSE CONDITION SECTION -->
          <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="display:flex;align-items:center;gap:8px;">
                <input type="checkbox" id="mock-cond-enabled" onchange="toggleConditionSection(this.checked)" style="width:16px;height:16px;cursor:pointer;">
                <label for="mock-cond-enabled" style="font-size:13px;font-weight:bold;color:#f8fafc;cursor:pointer;">⚖️ Bật Điều Kiện Kiểm Tra (IF - ELSE)</label>
              </div>
              <div id="mock-cond-type-group" style="display:none;gap:6px;">
                <button type="button" id="btn-cond-mode-simple" onclick="switchCondMode('simple')" style="background:#38bdf8;color:#0f172a;border:none;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;">Trực quan (Visual)</button>
                <button type="button" id="btn-cond-mode-script" onclick="switchCondMode('script')" style="background:#334155;color:#94a3b8;border:none;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;">Viết Code JS (Script)</button>
              </div>
            </div>

            <div id="mock-cond-details" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed #334155;">
              <!-- Simple Visual Mode -->
              <div id="cond-mode-simple-box">
                <div style="font-size:12px;color:#38bdf8;font-weight:bold;margin-bottom:6px;">🟢 NẾU (IF):</div>
                <div style="display:grid;grid-template-columns:150px 130px 1fr;gap:8px;margin-bottom:8px;">
                  <select id="mock-cond-field" onchange="onCondFieldChange()" style="background:#1e293b;border:1px solid #475569;border-radius:6px;color:#f8fafc;padding:6px;font-size:12px;">
                    <option value="reqBody">Request Body</option>
                    <option value="url">URL / Query</option>
                    <option value="reqHeader">Request Header</option>
                    <option value="resBody">Response Body (Server)</option>
                    <option value="resStatus">Server Status Code</option>
                  </select>
                  <select id="mock-cond-op" style="background:#1e293b;border:1px solid #475569;border-radius:6px;color:#f8fafc;padding:6px;font-size:12px;">
                    <option value="contains">Chứa chuỗi</option>
                    <option value="not_contains">Không chứa</option>
                    <option value="equals">Bằng chính xác</option>
                    <option value="not_equals">Khác giá trị</option>
                    <option value="regex">Khớp Regex</option>
                    <option value="starts_with">Bắt đầu bằng</option>
                    <option value="ends_with">Kết thúc bằng</option>
                  </select>
                  <input id="mock-cond-value" type="text" placeholder='Ví dụ: "action":"getDeviceInfo" hoặc did' style="background:#1e293b;border:1px solid #475569;border-radius:6px;color:#f8fafc;padding:6px 10px;font-family:monospace;font-size:12px;">
                </div>
                <div id="mock-cond-header-key-row" style="display:none;margin-bottom:8px;">
                  <input id="mock-cond-header-key" type="text" placeholder="Tên header cần kiểm tra (ví dụ: authorization, did, content-type)" style="width:100%;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#f8fafc;padding:6px 10px;font-family:monospace;font-size:12px;">
                </div>

                <div style="font-size:12px;color:#c084fc;font-weight:bold;margin:10px 0 4px;">➡️ THÌ (THEN):</div>
                <div style="font-size:12px;color:#94a3b8;margin-bottom:10px;">
                  Trả về <b>Mã Status</b> và <b>Nội Dung Response Body</b> tùy chỉnh đã cấu hình ở khung bên dưới.
                </div>

                <div style="font-size:12px;color:#f59e0b;font-weight:bold;margin-bottom:6px;">🔴 NGƯỢC LẠI (ELSE):</div>
                <div style="display:flex;gap:10px;align-items:center;">
                  <select id="mock-cond-else-action" onchange="onElseActionChange()" style="flex:1;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#f8fafc;padding:6px;font-size:12px;">
                    <option value="passthrough">Trả về kết quả gốc từ Server (Không can thiệp)</option>
                    <option value="custom">Trả về một Response Body phụ (Else Body)</option>
                  </select>
                </div>
                <div id="mock-cond-else-box" style="display:none;margin-top:8px;">
                  <label style="display:block;font-size:11px;color:#f59e0b;margin-bottom:2px;font-weight:bold;">Response Body khi rơi vào ELSE:</label>
                  <textarea id="mock-cond-else-body" rows="4" placeholder='{"ret":"fail","msg":"Condition not matched"}' style="width:100%;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#cbd5e1;padding:6px 10px;font-family:monospace;font-size:12px;"></textarea>
                </div>
              </div>

              <!-- Script Mode -->
              <div id="cond-mode-script-box" style="display:none;">
                <div style="font-size:12px;color:#cbd5e1;margin-bottom:6px;">
                  Viết đoạn code JS logic nhận <code>req</code> (method, url, headers, body) & <code>res</code> (statusCode, headers, body).
                </div>
                <textarea id="mock-cond-script-code" rows="6" style="width:100%;background:#090d16;border:1px solid #334155;border-radius:6px;color:#34d399;padding:8px 10px;font-family:monospace;font-size:12px;" placeholder="// Ví dụ kiểm tra Body:
if (req.body.includes('custom_keyword')) {
  return true; // Kích hoạt THEN (trả về Response Body bên dưới)
}
// Hoặc trả về object custom response:
// return { statusCode: 200, body: JSON.stringify({ ret: 'ok' }) };

return false; // Rơi vào ELSE (kết quả server gốc)"></textarea>
              </div>
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <label style="font-size:12px;color:#c084fc;font-weight:bold;">NỘI DUNG RESPONSE BODY MONG MUỐN TRẢ VỀ CHO APP/ROBOT</label>
              <button onclick="formatMockBody()" style="background:#334155;color:#f8fafc;border:none;padding:2px 8px;border-radius:4px;font-size:11px;cursor:pointer;">✨ Prettify JSON</button>
            </div>
            <textarea id="mock-response-body" rows="12" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f8fafc;padding:10px;font-family:monospace;font-size:12px;"></textarea>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid #334155;">
            <div style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="mock-rule-active-chk" checked style="width:16px;height:16px;cursor:pointer;">
              <label for="mock-rule-active-chk" style="font-size:13px;color:#f8fafc;cursor:pointer;font-weight:600;">Kích hoạt ngay (Checked)</label>
            </div>
            <button id="mock-save-btn" onclick="saveMockResponseRule()" style="background:#a855f7;color:white;font-weight:bold;border:none;border-radius:6px;padding:9px 20px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px;">
              💾 Lưu vào Data & Kích hoạt Ngay
            </button>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  // -------------------------------------------------------------
  // MODAL 3: Quản lý Danh sách Mock Rules (Check bật/tắt dễ dàng)
  // -------------------------------------------------------------
  function getRulesListModal() {
    let modal = document.getElementById('rules-manager-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'rules-manager-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999999;display:none;align-items:center;justify-content:center;backdrop-filter:blur(3px);';

    modal.innerHTML = `
      <div style="background:#1e293b;border:1px solid #475569;border-radius:12px;width:90%;max-width:950px;max-height:90vh;display:flex;flex-direction:column;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);">
        
        <div style="padding:14px 20px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;background:#111827;border-radius:12px 12px 0 0;">
          <div style="display:flex;align-items:center;gap:10px;">
            <strong style="font-size:16px;color:#a855f7;">📋 Cấu Hình & Quản Lý Rules AnyProxy</strong>
          </div>
          <button onclick="document.getElementById('rules-manager-modal').style.display='none'" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;line-height:1;">✕</button>
        </div>

        <!-- Sub Tabs -->
        <div style="display:flex;gap:4px;background:#0f172a;padding:10px 20px 0;border-bottom:1px solid #334155;">
          <button id="tab-btn-filerule" onclick="switchManagerSubTab('filerule')" style="background:none;border:none;color:#38bdf8;font-size:14px;font-weight:bold;padding:8px 16px;cursor:pointer;border-bottom:2px solid #38bdf8;">📁 File Rule .JS Tùy Chọn</button>
          <button id="tab-btn-mockdata" onclick="switchManagerSubTab('mockdata')" style="background:none;border:none;color:#94a3b8;font-size:14px;font-weight:bold;padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;">🎭 Danh Sách Mock Data (JSON)</button>
        </div>

        <!-- Tab 1: File Rule .JS -->
        <div id="subtab-filerule" style="padding:18px 20px;overflow-y:auto;flex:1;">
          <div style="background:#111827;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <input type="checkbox" id="ext-rule-enabled" onchange="applyExternalRuleFile()" style="width:18px;height:18px;cursor:pointer;">
                <label for="ext-rule-enabled" style="font-size:14px;font-weight:bold;color:#f8fafc;cursor:pointer;">☑️ Bật File Rule .JS Này</label>
              </div>
              <span id="ext-rule-status-badge" style="font-size:12px;padding:3px 10px;border-radius:4px;font-weight:bold;">Đang kiểm tra...</span>
            </div>

            <div style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;color:#94a3b8;font-weight:bold;margin-bottom:4px;">ĐƯỜNG DẪN FILE RULE (.JS) TRÊN MÁY BẠN</label>
              <div style="display:flex;gap:8px;">
                <input id="ext-rule-path-input" type="text" style="flex:1;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f8fafc;padding:8px 12px;font-family:monospace;font-size:13px;" placeholder="Ví dụ: C:\\rules\\my_custom_rule.js">
                <button onclick="applyExternalRuleFile()" style="background:#38bdf8;color:#0f172a;font-weight:bold;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;white-space:nowrap;">🔄 Áp Dụng Ngay</button>
              </div>
            </div>

            <div id="ext-rule-recents" style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <span style="font-size:12px;color:#94a3b8;">Gợi ý file gần đây:</span>
              <!-- populated dynamically -->
            </div>

            <div id="ext-rule-summary-box" style="background:#090d16;border:1px solid #1e293b;border-radius:6px;padding:10px 14px;font-size:12px;color:#94a3b8;margin-bottom:12px;">
              Tên Rule: <strong id="ext-rule-summary" style="color:#38bdf8;">-</strong>
            </div>

            <!-- Code Editor Toggle -->
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <button onclick="toggleRuleCodeEditor()" style="background:#334155;color:#f8fafc;border:none;padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer;">👁️ Xem / Sửa Code File Trực Tiếp</button>
                <button id="ext-rule-save-code-btn" onclick="saveRuleCodeFile()" style="display:none;background:#22c55e;color:#0f172a;border:none;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:bold;cursor:pointer;">💾 Lưu Code Lại Vào File</button>
              </div>
              <textarea id="ext-rule-code-area" rows="14" style="display:none;width:100%;background:#090d16;border:1px solid #334155;border-radius:6px;color:#e2e8f0;padding:10px;font-family:monospace;font-size:12px;"></textarea>
            </div>
          </div>
        </div>

        <!-- Tab 2: Mock Data -->
        <div id="subtab-mockdata" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
          <div style="padding:12px 20px;background:#0f172a;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:13px;color:#94a3b8;">
              ☑️ <b>Check</b> = Tự động trả về Response Body đã sửa.<br>
              ⬜ <b>Bỏ check</b> = Trả về kết quả thật từ Server như bình thường.
            </span>
            <button onclick="openResponseMockModal(null)" style="background:#a855f7;color:white;border:none;padding:6px 14px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:12px;">➕ Thêm Rule Mới</button>
          </div>

          <div id="rules-manager-content" style="padding:16px 20px;overflow-y:auto;flex:1;">
            <!-- Loaded dynamically -->
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  // -------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------
  window.openQuickComposer = async function(recordId) {
    const modal = getComposerModal();
    modal.style.display = 'flex';

    document.getElementById('qc-record-label').textContent = recordId ? 'Request #' + recordId : 'Request mới';
    document.getElementById('qc-full-link').href = '/composer' + (recordId ? '?id=' + recordId : '');

    document.getElementById('qc-res-status').textContent = '-';
    document.getElementById('qc-res-time').textContent = '-';
    document.getElementById('qc-res-size').textContent = '-';
    document.getElementById('qc-res-body').textContent = '(Bấm nút "🚀 Gửi" ở bên trái để chạy request)';

    if (recordId) {
      try {
        const res = await fetch('/api/composer/record?id=' + encodeURIComponent(recordId));
        const item = await res.json();
        if (item && item.url) {
          document.getElementById('qc-method').value = item.method || 'GET';
          document.getElementById('qc-url').value = item.url;
          document.getElementById('qc-headers').value = JSON.stringify(item.headers || {}, null, 2);
          document.getElementById('qc-body').value = item.reqBody || '';
          if (item.resBody) {
            document.getElementById('qc-res-body').textContent = item.resBody;
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  window.toggleConditionSection = function(enabled) {
    const details = document.getElementById('mock-cond-details');
    const group = document.getElementById('mock-cond-type-group');
    if (details) details.style.display = enabled ? 'block' : 'none';
    if (group) group.style.display = enabled ? 'flex' : 'none';
  };

  window.switchCondMode = function(mode) {
    const modal = document.getElementById('mock-response-modal');
    if (modal) modal.dataset.condMode = mode;
    const btnSimple = document.getElementById('btn-cond-mode-simple');
    const btnScript = document.getElementById('btn-cond-mode-script');
    const boxSimple = document.getElementById('cond-mode-simple-box');
    const boxScript = document.getElementById('cond-mode-script-box');

    if (mode === 'script') {
      if (boxSimple) boxSimple.style.display = 'none';
      if (boxScript) boxScript.style.display = 'block';
      if (btnScript) { btnScript.style.background = '#38bdf8'; btnScript.style.color = '#0f172a'; }
      if (btnSimple) { btnSimple.style.background = '#334155'; btnSimple.style.color = '#94a3b8'; }
    } else {
      if (boxSimple) boxSimple.style.display = 'block';
      if (boxScript) boxScript.style.display = 'none';
      if (btnSimple) { btnSimple.style.background = '#38bdf8'; btnSimple.style.color = '#0f172a'; }
      if (btnScript) { btnScript.style.background = '#334155'; btnScript.style.color = '#94a3b8'; }
    }
  };

  window.onCondFieldChange = function() {
    const field = document.getElementById('mock-cond-field').value;
    const hRow = document.getElementById('mock-cond-header-key-row');
    if (hRow) hRow.style.display = field === 'reqHeader' ? 'block' : 'none';
  };

  window.onElseActionChange = function() {
    const action = document.getElementById('mock-cond-else-action').value;
    const eBox = document.getElementById('mock-cond-else-box');
    if (eBox) eBox.style.display = action === 'custom' ? 'block' : 'none';
  };

  window.openResponseMockModal = async function(recordId) {
    const modal = getMockModal();
    modal.style.display = 'flex';
    modal.dataset.editingRuleId = '';
    modal.dataset.condMode = 'simple';

    // Reset condition fields
    document.getElementById('mock-cond-enabled').checked = false;
    toggleConditionSection(false);
    switchCondMode('simple');
    document.getElementById('mock-cond-field').value = 'reqBody';
    document.getElementById('mock-cond-op').value = 'contains';
    document.getElementById('mock-cond-value').value = '';
    document.getElementById('mock-cond-header-key').value = '';
    document.getElementById('mock-cond-script-code').value = '';
    document.getElementById('mock-cond-else-action').value = 'passthrough';
    document.getElementById('mock-cond-else-body').value = '';
    onCondFieldChange();
    onElseActionChange();
    document.getElementById('mock-save-btn').textContent = '💾 Lưu vào Data & Kích hoạt Ngay';

    let currentUrl = '';
    let currentResBody = '';
    let currentStatusCode = 200;

    if (recordId) {
      try {
        const res = await fetch('/api/composer/record?id=' + encodeURIComponent(recordId));
        const item = await res.json();
        if (item) {
          currentUrl = item.url || '';
          currentResBody = item.resBody || '';
          currentStatusCode = item.statusCode || 200;
        }
      } catch (e) {
        console.error(e);
      }
    }

    document.getElementById('mock-rule-name').value = 'Mock: ' + (currentUrl ? currentUrl.split('?')[0].slice(-35) : 'Ecovacs Response');
    document.getElementById('mock-url-pattern').value = currentUrl || '';
    document.getElementById('mock-status-code').value = currentStatusCode;
    document.getElementById('mock-response-body').value = currentResBody;
    document.getElementById('mock-rule-active-chk').checked = true;

    try {
      if (currentResBody && (currentResBody.startsWith('{') || currentResBody.startsWith('['))) {
        document.getElementById('mock-response-body').value = JSON.stringify(JSON.parse(currentResBody), null, 2);
      }
    } catch(e) {}
  };

  window.switchManagerSubTab = function(tabName) {
    const tabBtnFile = document.getElementById('tab-btn-filerule');
    const tabBtnMock = document.getElementById('tab-btn-mockdata');
    const subtabFile = document.getElementById('subtab-filerule');
    const subtabMock = document.getElementById('subtab-mockdata');

    if (tabName === 'filerule') {
      subtabFile.style.display = 'block';
      subtabMock.style.display = 'none';
      tabBtnFile.style.color = '#38bdf8';
      tabBtnFile.style.borderBottom = '2px solid #38bdf8';
      tabBtnMock.style.color = '#94a3b8';
      tabBtnMock.style.borderBottom = '2px solid transparent';
      loadExternalRuleInfo();
    } else {
      subtabFile.style.display = 'none';
      subtabMock.style.display = 'flex';
      tabBtnMock.style.color = '#a855f7';
      tabBtnMock.style.borderBottom = '2px solid #a855f7';
      tabBtnFile.style.color = '#94a3b8';
      tabBtnFile.style.borderBottom = '2px solid transparent';
      loadMockRulesList();
    }
  };

  window.loadExternalRuleInfo = async function() {
    const chk = document.getElementById('ext-rule-enabled');
    const pathInput = document.getElementById('ext-rule-path-input');
    const badge = document.getElementById('ext-rule-status-badge');
    const summary = document.getElementById('ext-rule-summary');
    const recentsDiv = document.getElementById('ext-rule-recents');

    try {
      const res = await fetch('/api/composer/external-rule');
      const data = await res.json();
      if (!data) return;

      chk.checked = !!data.enabled;
      if (!pathInput.value || pathInput.value !== data.rulePath) {
        pathInput.value = data.rulePath || '';
      }

      if (data.enabled) {
        if (data.fileExists) {
          badge.style.background = '#065f46';
          badge.style.color = '#34d399';
          badge.textContent = '🟢 ĐANG BẬT & ÁP DỤNG';
        } else {
          badge.style.background = '#991b1b';
          badge.style.color = '#f87171';
          badge.textContent = '🔴 FILE KHÔNG TỒN TẠI';
        }
      } else {
        badge.style.background = '#374151';
        badge.style.color = '#9ca3af';
        badge.textContent = '⚪ ĐANG TẮT (Check để bật)';
      }

      summary.textContent = data.summary ? data.summary : (data.loadError ? 'Lỗi nạp module: ' + data.loadError : (data.fileExists ? 'Sẵn sàng nạp' : 'Chưa tìm thấy file'));

      if (data.recentPaths && data.recentPaths.length) {
        recentsDiv.innerHTML = '<span style="font-size:12px;color:#94a3b8;">Gợi ý file gần đây:</span>' + 
          data.recentPaths.map(p => `
            <button onclick="selectRecentRulePath('${p.replace(/\\/g, '\\\\')}')" style="background:#1e293b;border:1px solid #475569;border-radius:4px;color:#cbd5e1;padding:3px 8px;font-size:11px;font-family:monospace;cursor:pointer;">
              📄 ${p.split(/[\\/]/).pop()}
            </button>
          `).join('');
      }
    } catch(e) {
      console.error('Lỗi loadExternalRuleInfo:', e);
    }
  };

  window.selectRecentRulePath = function(p) {
    document.getElementById('ext-rule-path-input').value = p;
    applyExternalRuleFile();
  };

  window.applyExternalRuleFile = async function() {
    const enabled = document.getElementById('ext-rule-enabled').checked;
    const rulePath = document.getElementById('ext-rule-path-input').value.trim();

    if (!rulePath) {
      alert('Vui lòng nhập đường dẫn file .js!');
      return;
    }

    try {
      const res = await fetch('/api/composer/external-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, rulePath })
      });
      const data = await res.json();
      if (data.success) {
        await loadExternalRuleInfo();
        const codeArea = document.getElementById('ext-rule-code-area');
        if (codeArea && codeArea.style.display !== 'none') {
          loadRuleCodeContent(rulePath);
        }
      }
    } catch(e) {
      alert('Lỗi áp dụng rule: ' + e.message);
    }
  };

  async function loadRuleCodeContent(filePath) {
    const codeArea = document.getElementById('ext-rule-code-area');
    try {
      const res = await fetch('/api/composer/read-rule-file?filePath=' + encodeURIComponent(filePath));
      const data = await res.json();
      if (data.success) {
        codeArea.value = data.content;
      } else {
        codeArea.value = '// Lỗi đọc file: ' + (data.error || 'Unknown error');
      }
    } catch(e) {
      codeArea.value = '// Lỗi kết nối: ' + e.message;
    }
  }

  window.toggleRuleCodeEditor = async function() {
    const codeArea = document.getElementById('ext-rule-code-area');
    const saveBtn = document.getElementById('ext-rule-save-code-btn');
    const filePath = document.getElementById('ext-rule-path-input').value.trim();

    if (codeArea.style.display === 'none' || !codeArea.style.display) {
      codeArea.style.display = 'block';
      saveBtn.style.display = 'inline-block';
      codeArea.value = '// Đang tải nội dung file...';
      await loadRuleCodeContent(filePath);
    } else {
      codeArea.style.display = 'none';
      saveBtn.style.display = 'none';
    }
  };

  window.saveRuleCodeFile = async function() {
    const filePath = document.getElementById('ext-rule-path-input').value.trim();
    const content = document.getElementById('ext-rule-code-area').value;

    if (!filePath) {
      alert('Chưa có đường dẫn file!');
      return;
    }

    try {
      const res = await fetch('/api/composer/save-rule-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content })
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 ĐÃ LƯU FILE THÀNH CÔNG!\n\nAnyProxy đã tự động nạp code mới nhất từ: ' + filePath);
        loadExternalRuleInfo();
      } else {
        alert('Lỗi lưu file: ' + (data.error || 'Unknown'));
      }
    } catch(e) {
      alert('Lỗi: ' + e.message);
    }
  };

  window.loadMockRulesList = async function() {
    const container = document.getElementById('rules-manager-content');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">Đang tải danh sách rules...</div>';

    try {
      const res = await fetch('/api/composer/rules');
      const rules = await res.json();

      if (!rules || !rules.length) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">Chưa có Mock Rule nào trong Data. Hãy bấm vào một request bất kỳ rồi chọn <b>[🎭 Sửa Response Body]</b>.</div>';
        return;
      }

      container.innerHTML = rules.map((r, idx) => {
        const isChecked = r.enabled ? 'checked' : '';
        const bodyPreview = (r.modifyResponseBody && r.modifyResponseBody.content) ? r.modifyResponseBody.content.slice(0, 150) + '...' : '(Không có body)';

        let condBadge = '<span style="font-size:11px;background:#334155;color:#94a3b8;padding:2px 6px;border-radius:4px;margin-left:8px;">⚡ Không điều kiện</span>';
        if (r.condition && r.condition.enabled) {
          if (r.condition.type === 'script') {
            condBadge = '<span style="font-size:11px;background:#065f46;color:#34d399;padding:2px 6px;border-radius:4px;margin-left:8px;">⚖️ IF: Script JS</span>';
          } else {
            const fieldMap = { reqBody: 'Body', url: 'URL', reqHeader: 'Header', resBody: 'ResBody', resStatus: 'Status' };
            const fLabel = fieldMap[r.condition.field] || r.condition.field;
            const opLabel = r.condition.operator === 'contains' ? 'chứa' : (r.condition.operator === 'equals' ? '==' : r.condition.operator);
            condBadge = `<span style="font-size:11px;background:#1e3a8a;color:#93c5fd;padding:2px 6px;border-radius:4px;margin-left:8px;">⚖️ IF: ${fLabel} ${opLabel} "${(r.condition.value || '').slice(0, 25)}"</span>`;
          }
        }
        if (r.elseAction === 'custom') {
          condBadge += ' <span style="font-size:11px;background:#78350f;color:#fcd34d;padding:2px 6px;border-radius:4px;margin-left:4px;">ELSE: Body phụ</span>';
        }

        return `
          <div style="background:#111827;border:1px solid #334155;border-radius:8px;padding:12px 16px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <input type="checkbox" ${isChecked} onchange="toggleRuleFromManager(${idx}, this.checked)" style="width:18px;height:18px;cursor:pointer;">
                <div>
                  <strong style="font-size:14px;color:#c084fc;">${r.name || 'Rule #' + (idx+1)}</strong>
                  ${condBadge}
                  <span style="font-family:monospace;color:#94a3b8;margin-left:8px;font-size:12px;">${r.urlPattern || '*'}</span>
                </div>
              </div>
              <div style="display:flex;gap:8px;">
                <button onclick="editRuleContent(${idx})" style="background:#334155;color:#f8fafc;border:none;padding:3px 10px;border-radius:4px;font-size:12px;cursor:pointer;">✏️ Sửa Body & Điều kiện</button>
                <button onclick="deleteRuleFromManager(${idx})" style="background:#dc2626;color:white;border:none;padding:3px 10px;border-radius:4px;font-size:12px;cursor:pointer;">🗑️ Xóa</button>
              </div>
            </div>
            <div style="font-family:monospace;font-size:11px;color:#64748b;background:#090d16;padding:6px 10px;border-radius:4px;max-height:50px;overflow:hidden;text-overflow:ellipsis;">
              ${bodyPreview}
            </div>
          </div>
        `;
      }).join('');

    } catch(e) {
      container.innerHTML = '<div style="color:#ef4444;text-align:center;">Lỗi tải rules: ' + e.message + '</div>';
    }
  };

  window.openRulesListModal = async function() {
    const modal = getRulesListModal();
    modal.style.display = 'flex';
    loadExternalRuleInfo();
    loadMockRulesList();
  };

  window.toggleRuleFromManager = async function(idx, checked) {
    try {
      const res = await fetch('/api/composer/rules');
      const rules = await res.json();
      rules[idx].enabled = checked;
      await fetch('/api/composer/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules)
      });
      updateRuleCount();
    } catch(e) {
      alert('Lỗi cập nhật trạng thái: ' + e.message);
    }
  };

  window.deleteRuleFromManager = async function(idx) {
    if (confirm('Bạn có chắc muốn xóa Mock Rule này?')) {
      try {
        const res = await fetch('/api/composer/rules');
        const rules = await res.json();
        rules.splice(idx, 1);
        await fetch('/api/composer/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rules)
        });
        updateRuleCount();
        openRulesListModal();
      } catch(e) {
        alert('Lỗi xóa: ' + e.message);
      }
    }
  };

  window.editRuleContent = async function(idx) {
    try {
      const res = await fetch('/api/composer/rules');
      const rules = await res.json();
      const r = rules[idx];

      const modal = getMockModal();
      modal.style.display = 'flex';
      modal.dataset.editingRuleId = r.id || ('rule_' + idx);

      document.getElementById('mock-rule-name').value = r.name || '';
      document.getElementById('mock-url-pattern').value = r.urlPattern || '';
      document.getElementById('mock-status-code').value = r.modifyResponseStatusCode || 200;
      document.getElementById('mock-response-body').value = (r.modifyResponseBody && r.modifyResponseBody.content) || '';
      document.getElementById('mock-rule-active-chk').checked = r.enabled !== false;

      // Restore condition
      if (r.condition && r.condition.enabled) {
        document.getElementById('mock-cond-enabled').checked = true;
        toggleConditionSection(true);
        const mode = r.condition.type || 'simple';
        switchCondMode(mode);
        document.getElementById('mock-cond-field').value = r.condition.field || 'reqBody';
        document.getElementById('mock-cond-op').value = r.condition.operator || 'contains';
        document.getElementById('mock-cond-value').value = r.condition.value || '';
        document.getElementById('mock-cond-header-key').value = r.condition.headerKey || '';
        document.getElementById('mock-cond-script-code').value = r.condition.scriptCode || '';
        onCondFieldChange();
      } else {
        document.getElementById('mock-cond-enabled').checked = false;
        toggleConditionSection(false);
        switchCondMode('simple');
      }

      document.getElementById('mock-cond-else-action').value = r.elseAction || 'passthrough';
      onElseActionChange();
      document.getElementById('mock-cond-else-body').value = r.elseBody || '';

      document.getElementById('mock-save-btn').textContent = '💾 Cập Nhật Rule Này';
    } catch(e) {
      alert('Lỗi: ' + e.message);
    }
  };

  window.mockFromCurrentResponse = function() {
    const currentUrl = document.getElementById('qc-url').value;
    const currentResBody = document.getElementById('qc-res-body').textContent;
    const statusText = document.getElementById('qc-res-status').textContent;
    const statusCode = parseInt(statusText, 10) || 200;

    const modal = getMockModal();
    modal.style.display = 'flex';
    modal.dataset.editingRuleId = '';

    document.getElementById('mock-rule-name').value = 'Mock: ' + (currentUrl ? currentUrl.split('?')[0].slice(-35) : 'Custom Mock');
    document.getElementById('mock-url-pattern').value = currentUrl || '';
    document.getElementById('mock-status-code').value = statusCode;
    document.getElementById('mock-response-body').value = currentResBody;
    document.getElementById('mock-rule-active-chk').checked = true;

    // Reset condition
    document.getElementById('mock-cond-enabled').checked = false;
    toggleConditionSection(false);
    switchCondMode('simple');
    document.getElementById('mock-save-btn').textContent = '💾 Lưu vào Data & Kích hoạt Ngay';
  };

  window.formatMockBody = function() {
    const area = document.getElementById('mock-response-body');
    try {
      area.value = JSON.stringify(JSON.parse(area.value), null, 2);
    } catch (e) {
      alert('Nội dung body không phải JSON hợp lệ!');
    }
  };

  window.saveMockResponseRule = async function() {
    const modal = document.getElementById('mock-response-modal');
    const btn = document.getElementById('mock-save-btn');
    const name = document.getElementById('mock-rule-name').value.trim() || 'Mock Response Rule';
    const urlPattern = document.getElementById('mock-url-pattern').value.trim();
    const statusCode = parseInt(document.getElementById('mock-status-code').value, 10) || 200;
    const responseBody = document.getElementById('mock-response-body').value;
    const isChecked = document.getElementById('mock-rule-active-chk').checked;

    if (!urlPattern) {
      alert('Vui lòng nhập URL cần chặn để sửa response!');
      return;
    }

    const condEnabled = document.getElementById('mock-cond-enabled').checked;
    const condMode = modal.dataset.condMode || 'simple';
    const condition = {
      enabled: condEnabled,
      type: condMode,
      field: document.getElementById('mock-cond-field').value,
      operator: document.getElementById('mock-cond-op').value,
      value: document.getElementById('mock-cond-value').value,
      headerKey: document.getElementById('mock-cond-header-key').value.trim(),
      scriptCode: document.getElementById('mock-cond-script-code').value
    };
    const elseAction = document.getElementById('mock-cond-else-action').value;
    const elseBody = document.getElementById('mock-cond-else-body').value;

    btn.disabled = true;
    btn.textContent = '⏳ Đang lưu...';

    const editingRuleId = modal.dataset.editingRuleId;
    const ruleObj = {
      id: editingRuleId || ('mock_rule_' + Date.now()),
      name: name,
      enabled: isChecked,
      matchMethod: 'ALL',
      urlPattern: urlPattern,
      isRegex: false,
      condition: condition,
      elseAction: elseAction,
      elseBody: elseBody,
      modifyRequestHeaders: null,
      modifyRequestBody: null,
      modifyResponseStatusCode: statusCode,
      modifyResponseBody: {
        mode: 'full',
        content: responseBody
      }
    };

    try {
      if (editingRuleId) {
        // Update existing rule
        const getRes = await fetch('/api/composer/rules');
        let rules = await getRes.json();
        const rIndex = rules.findIndex(r => r.id === editingRuleId);
        if (rIndex !== -1) {
          rules[rIndex] = Object.assign({}, rules[rIndex], ruleObj);
        } else {
          rules.unshift(ruleObj);
        }
        await fetch('/api/composer/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rules)
        });
        alert('🎉 ĐÃ CẬP NHẬT RULE THÀNH CÔNG!');
      } else {
        // Add new rule
        const res = await fetch('/api/composer/rules/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleObj)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Lỗi lưu rule');
        alert('🎉 ĐÃ LƯU VÀO DATA THÀNH CÔNG!\n\n' + (isChecked ? 'Trạng thái: ĐÃ CHECK (BẬT) - Sẽ tự động áp dụng khi khớp URL và Điều kiện.' : 'Trạng thái: CHƯA CHECK (TẮT) - Sẽ giữ nguyên từ server thật.'));
      }

      modal.style.display = 'none';
      updateRuleCount();
      loadMockRulesList();
    } catch (e) {
      alert('Lỗi kết nối tới server: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = editingRuleId ? '💾 Cập Nhật Rule Này' : '💾 Lưu vào Data & Kích hoạt Ngay';
    }
  };

  window.formatQuickBody = function() {
    const area = document.getElementById('qc-body');
    try {
      area.value = JSON.stringify(JSON.parse(area.value), null, 2);
    } catch (e) {
      alert('Nội dung body không phải JSON hợp lệ!');
    }
  };

  window.copyQuickResponse = function() {
    const text = document.getElementById('qc-res-body').textContent;
    navigator.clipboard.writeText(text).then(function() {
      alert('Đã copy Response Body!');
    });
  };

  window.sendQuickRequest = async function() {
    const btn = document.getElementById('qc-send-btn');
    const method = document.getElementById('qc-method').value;
    const url = document.getElementById('qc-url').value.trim();
    const headersStr = document.getElementById('qc-headers').value.trim();
    const body = document.getElementById('qc-body').value;

    let headers = {};
    if (headersStr) {
      try {
        headers = JSON.parse(headersStr);
      } catch (e) {
        alert('Headers phải là JSON hợp lệ!');
        return;
      }
    }

    btn.disabled = true;
    btn.textContent = '⏳ Đang gửi...';

    try {
      const res = await fetch('/api/composer/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, url, headers, body })
      });
      const data = await res.json();

      if (data.success) {
        const statusEl = document.getElementById('qc-res-status');
        statusEl.textContent = data.statusCode + ' ' + (data.statusMessage || '');
        statusEl.style.color = data.statusCode < 400 ? '#4ade80' : '#f87171';
        document.getElementById('qc-res-time').textContent = data.durationMs + ' ms';
        document.getElementById('qc-res-size').textContent = (data.bodySize || 0) + ' bytes';

        if (data.isJson && data.json) {
          document.getElementById('qc-res-body').textContent = JSON.stringify(data.json, null, 2);
        } else {
          document.getElementById('qc-res-body').textContent = data.body || '(Empty Body)';
        }
      } else {
        document.getElementById('qc-res-status').textContent = 'FAILED';
        document.getElementById('qc-res-status').style.color = '#f87171';
        document.getElementById('qc-res-time').textContent = data.durationMs + ' ms';
        document.getElementById('qc-res-body').textContent = 'Lỗi: ' + (data.error || 'Unknown Error');
      }
    } catch (err) {
      alert('Lỗi kết nối tới Composer: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 Gửi';
    }
  };

})();
