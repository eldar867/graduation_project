// Конфигурация методов анонимизации
const METHODS = {
    'none': { label: 'Без изменений', fn: val => val },
    'mask': { label: 'Маскирование', fn: val => val.replace(/./g, '*') },
    'hash': { label: 'Хеширование (простое)', fn: val => btoa(unescape(encodeURIComponent(val))).slice(0, 8) },
    'generalize': { label: 'Обобщение', fn: val => val.length > 3 ? val.slice(0, 3) + '...' : val },
    'remove': { label: 'Удалить столбец', fn: () => null }
};

// Детекция типов ПДн (упрощённая эвристика)
function detectType(value) {
    if (!value) return 'text';
    if (/^\S+@\S+\.\S+$/.test(value)) return 'email';
    if (/^\+?\d{10,15}$/.test(value.replace(/\D/g, ''))) return 'phone';
    if (/^\d{10,14}$/.test(value.replace(/\D/g, ''))) return 'passport';
    if (/^[А-ЯЁ][а-яё]+(\s[А-ЯЁ][а-яё]+)+$/.test(value)) return 'name';
    return 'text';
}

// Глобальное состояние
let rawData = [], headers = [], colTypes = [], selectedMethods = {};

// === ЛОГИКА ДЛЯ INDEX.HTML ===
if (document.getElementById('uploadForm')) {
    document.getElementById('uploadForm').addEventListener('submit', e => {
        e.preventDefault();
        const file = document.getElementById('csvFile').files[0];
        if (!file) return alert('Выберите файл');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: res => {
                rawData = res.data;
                headers = res.meta.fields;
                colTypes = headers.map(h => detectType(rawData[0]?.[h] || ''));
                
                localStorage.setItem('anon_headers', JSON.stringify(headers));
                localStorage.setItem('anon_types', JSON.stringify(colTypes));
                localStorage.setItem('anon_raw', JSON.stringify(rawData));

                renderTable(rawData.slice(0, 5), headers, colTypes);
                document.getElementById('status').textContent = `✅ Загружено ${rawData.length} строк. Обнаружено ПДн: ${colTypes.filter(t=>t!=='text').length} полей.`;
                document.getElementById('nextBtn').classList.remove('hidden');
            }
        });
    });

    function renderTable(data, h, t) {
        const thead = document.getElementById('tableHead');
        const tbody = document.getElementById('tableBody');
        thead.innerHTML = `<tr>${h.map((col, i) => `<th>${col} <small>(${t[i]})</small></th>`).join('')}</tr>`;
        tbody.innerHTML = data.map(row => `<tr>${h.map(col => `<td>${row[col] || ''}</td>`).join('')}</tr>`).join('');
        document.getElementById('dataTable').classList.remove('hidden');
    }
}

// === ЛОГИКА ДЛЯ PREVIEW.HTML ===
if (document.getElementById('controls')) {
    headers = JSON.parse(localStorage.getItem('anon_headers') || '[]');
    colTypes = JSON.parse(localStorage.getItem('anon_types') || '[]');

    const controls = document.getElementById('controls');
    headers.forEach((col, i) => {
        if (colTypes[i] === 'text') return; // Пропускаем не-ПДн для демо
        const div = document.createElement('div');
        div.className = 'control-card';
        div.innerHTML = `
            <label>${col} <small>(${colTypes[i]})</small></label>
            <select data-col="${i}">
                ${Object.entries(METHODS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
            </select>`;
        controls.appendChild(div);
    });

    document.getElementById('applyBtn').addEventListener('click', () => {
        document.querySelectorAll('select').forEach(sel => {
            selectedMethods[sel.dataset.col] = sel.value;
        });
        localStorage.setItem('anon_methods', JSON.stringify(selectedMethods));

        const anonymized = rawData.map(row => {
            const newRow = {...row};
            headers.forEach((col, i) => {
                const method = selectedMethods[i] || 'none';
                if (METHODS[method].fn) newRow[col] = METHODS[method].fn(row[col]);
                else delete newRow[col];
            });
            return newRow;
        });

        localStorage.setItem('anon_final', JSON.stringify(anonymized));
        renderPreview(rawData.slice(0,5), anonymized.slice(0,5));
        document.getElementById('previewSection').classList.remove('hidden');
    });

    function renderPreview(before, after) {
        const thead = document.getElementById('previewHead');
        const tbody = document.getElementById('previewBody');
        thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
        tbody.innerHTML = before.map((row, i) => {
            const afterRow = after[i];
            return `<tr>
                ${headers.map(h => `<td><span style="color:#666">${row[h]||''}</span><br>→ <b>${afterRow[h]||'(удалено)'}</b></td>`).join('')}
            </tr>`;
        }).join('');
    }
}

// === ЛОГИКА ДЛЯ EXPORT.HTML ===
if (document.getElementById('downloadCsv')) {
    const finalData = JSON.parse(localStorage.getItem('anon_final') || '[]');
    const methods = JSON.parse(localStorage.getItem('anon_methods') || '{}');
    const summary = document.getElementById('summary');
    
    if (finalData.length === 0) {
        summary.textContent = '⚠️ Нет данных для экспорта. Загрузите файл и настройте методы.';
    } else {
        summary.textContent = `✅ Обработано строк: ${finalData.length}\nПрименённые методы:\n${Object.entries(methods).map(([k,v]) => `- Столбец ${k}: ${METHODS[v].label}`).join('\n')}`;
    }

    document.getElementById('downloadCsv').addEventListener('click', () => {
        if (!finalData.length) return alert('Нет данных');
        const csv = Papa.unparse(finalData);
        downloadFile('anonymized.csv', csv, 'text/csv');
    });

    document.getElementById('downloadReport').addEventListener('click', () => {
        const report = { timestamp: new Date().toISOString(), methods, rowCount: finalData.length, fields: headers };
        downloadFile('report.json', JSON.stringify(report, null, 2), 'application/json');
    });
}

function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
}

function clearAll() {
    localStorage.clear();
    location.href = 'index.html';
}