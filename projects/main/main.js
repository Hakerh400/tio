'use strict';

const LOCAL = O.url.startsWith('http://localhost/');
const RUN_HW_PROG = 0;

const loadingDiv = O.ceDiv(O.body);

if(!LOCAL){
  const h1 = O.ce(loadingDiv, 'h1');
  h1.style.position = 'absolute';
  h1.style.top = '0px';
  h1.style.left = '0px';
  h1.style.margin = '18px';
  h1.style.color = '#aa0';
  h1.innerText = 'Loading...';
  await O.raf2a(O.nop);
}

await O.addStyle('style.css');

const fs = require('fs');
const assert = require('assert');
const esolangs = require('@hakerh400/esolangs');
const Encoding = require('./encoding');

const UID = 'esolangs';
const VERSION = O.urlParam('ver', '1.0.0');
const WIKI_EXPORT = O.urlParam('wiki', 0) & 1;

const versions = [
  '1.0.0',
  '1.0.1',
];

const sem = new O.Semaphore(1);

const langs = esolangs.getLangs().
  map(a => esolangs.getInfo(a)).
  filter(a => !a.wip && !(a.browserSupport === false));

const hwStr = esolangs.getStr('hello-world');

const ioAdapters = [
  ['No adapter', null],
  ['Padding', 'text'],
  ['Bijection', 'byte-array'],
];

let firstLang = 'Text';

let srcEncoding = 'UTF-8';
let inputAdapter = 'text';
let outputAdapter = 'text';

let headerText = '';
let codeText = '';
let footerText = '';
let inputText = '';
let outputText = '';
let debugText = '';
let errMsg = null;

parseUrl: {
  const data = O.urlParam('data', null);
  if(data === null) break parseUrl;

  if(!/^[a-zA-Z0-9]*\=*$/.test(data)){
    errMsg = `Invalid URL`;
    break parseUrl;
  }

  const buf = O.base62.decode(data);
  let ser;

  try{
    ser = new O.Serializer(buf, 1);
  }catch(err){
    errMsg = `Invalid URL checksum`;
    break parseUrl;
  }

  const uid = ser.readStr();

  if(uid !== UID){
    errMsg = `Incorrect UID`;
    break parseUrl;
  }

  const ver = O.ca(3, () => ser.readUint()).join('.');

  if(!versions.includes(ver)){
    errMsg = `Unsupported version ${ver}`;
    break parseUrl;
  }

  ser.readDouble();

  let lang = ser.readStr();

  if(!langs.some(a => a.name === lang)){
    errMsg = `Unknown language ${O.sf(lang)}`;
    break parseUrl;
  }

  firstLang = lang;

  srcEncoding = ser.readStr();
  inputAdapter = ser.readStr();
  outputAdapter = ser.readStr();

  headerText = ser.readStr();
  codeText = ser.readStr();

  if(ver === '1.0.1')
    codeText = await require(codeText);

  footerText = ser.readStr();
  inputText = ser.readStr();
  outputText = ser.readStr();
  debugText = ser.readStr();
}

const sectsInfo = [
  ['Header', 1, headerText, null],
  ['Code', 1, 1, Encoding[srcEncoding]],
  ['Footer', 1, footerText, null],
  ['Input', 1, 1, null],
  ['Output', 0, 1, null],
  ['Debug', 0, 1, null],
  ['Export', 0, 0, null],
];

const btnRunLabels = [
  'Run (Ctrl+Enter)',
  'Running...',
];

const main = () => {
  loadingDiv.remove();

  const intface = new Interface(O.body);

  if(errMsg !== null)
    intface.showInternalErr('Code', errMsg);

  intface.set('Header', headerText);
  intface.set('Code', codeText);
  intface.set('Footer', footerText);
  intface.set('Input', inputText);
  intface.set('Output', outputText);
  intface.set('Debug', debugText);
};

class Interface{
  lang = null;
  info = null;

  #sects = O.obj();
  #running = 0;
  #inputStates = new Map();

  constructor(elem){
    this.div = O.ceDiv(elem, 'interface');
    this.optsElem = O.ceDiv(this.div, 'options');

    this.langChoice = O.ceDiv(this.optsElem, 'opt-wrap');
    this.langChoiceLabel = O.ceDiv(this.langChoice, 'opt-lab');
    this.langChoiceLabel.innerText = 'Language:'
    this.langList = O.ce(this.langChoice, 'select', 'opt');

    for(const {name} of langs){
      const item = O.ce(this.langList, 'option');
      item.innerText = name;

      if(name === firstLang)
        item.selected = 1;
    }

    const onLangChange = () => {
      this.lock(async () => {
        const langNew = this.langList.value;
        if(langNew === this.lang) return;

        this.setLang(langNew);

        // this.clear('Input');
        // this.clear('Debug');
      });
    };

    O.ael(this.langList, 'input', onLangChange);

    O.ceBr(this.optsElem, 2);

    for(const type of ['input', 'output']){
      const adapterType = type === 'input' ? inputAdapter : outputAdapter;

      this[`${type}AdapterChoice`] = O.ceDiv(this.optsElem, 'opt-wrap');
      this[`${type}AdapterChoiceLabel`] = O.ceDiv(this[`${type}AdapterChoice`], 'opt-lab');
      this[`${type}AdapterChoiceLabel`].innerText = `${O.cap(type)} adapter:`;
      const list = this[`${type}AdapterList`] = O.ce(this[`${type}AdapterChoice`], 'select', 'opt');

      for(const [adapter, fmt] of ioAdapters){
        const item = O.ce(list, 'option');
        item.innerText = adapter;
        item.value = fmt || '';

        if(item.value === adapterType)
          item.selected = 1;
      }
    }

    O.ceBr(this.optsElem, 2);

    this.btnRunWrap = O.ceDiv(this.optsElem, 'opt-wrap');
    this.btnRun = O.ceButton(this.btnRunWrap, btnRunLabels[0], 'opt btn', evt => {
      this.run();
    });

    this.btnHwProgWrap = O.ceDiv(this.optsElem, 'opt-wrap');
    this.btnHwProg = O.ceButton(this.btnHwProgWrap, 'Hello World', 'opt btn', evt => {
      this.lock(async () => {
        this.runHwProg();
      });
    });

    this.btnExportWrap = O.ceDiv(this.optsElem, 'opt-wrap');
    this.btnExport = O.ceButton(this.btnExportWrap, 'Export', 'opt btn', evt => {
      this.lock(async () => {
        this.export();
      });
    });

    O.ael('keydown', evt => {
      if(evt.ctrlKey && evt.code === 'Enter'){
        this.run();
        return;
      }
    });

    this.sectsElem = O.ceDiv(this.div, 'sections');

    const sects = this.#sects;

    for(const info of sectsInfo){
      const [name, editable, expanded, encoding] = info;
      sects[name] = new Section(this.sectsElem, name, '', editable, expanded, encoding);
    }

    onLangChange();
  }

  lock(func){
    const enter = async () => {
      await sem.wait();

      this.saveInputStates();
      this.disableInputs();
    };

    const exit = async () => {
      this.restoreInputStates();
      sem.signal();
    };

    handle(enter().then(func).finally(exit));
  }

  get allInputs(){ return O.qsa('textarea'); }

  saveInputStates(){
    const states = this.#inputStates;
    states.clear();

    for(const elem of this.allInputs)
      states.set(elem, !elem.readOnly);
  }

  restoreInputStates(){
    for(const [elem, enabled] of this.#inputStates)
      elem.readOnly = !enabled;
  }

  setInputsState(enabled){
    for(const elem of this.allInputs)
      elem.readOnly = !enabled;
  }

  enableInputs(){
    this.setInputsState(1);
  }

  disableInputs(){
    this.setInputsState(0);
  }

  run(){
    if(this.#running) return;

    this.#running = 1;
    this.btnRun.innerText = btnRunLabels[1];
    this.btnRun.disabled = 1;

    O.raf2(() => {
      this.lock(async () => {
        const {lang, info} = this;
        
        const header = this.get('Header');
        const code = this.get('Code');
        const footer = this.get('Footer');
        const fullCode = header + code + footer;

        const input = this.get('Input');

        const inputAdapter = this.getInputAdapter();
        const outputAdapter = this.getOutputAdapter();

        const opts = {
          inputAdapter,
          outputAdapter,
        };

        try{
          const output = await esolangs.run(lang, fullCode, input, opts);
          this.set('Output', output.toString());
          this.clear('Debug');
          this.hideAllInternalErrs();
        }catch(err){
          let internal = 0;

          const s = (
            err instanceof O.CustomError && !(err instanceof O.AssertionError) ?
            err.message : (
              internal = 1,
              err instanceof Error ? err.stack :
              String(err)
            )
          );

          this.set('Debug', s);
          this.clear('Output');

          if(internal){
            this.showInternalErr(O.ftext(`
              Internal error!
              This is a bug in the interpreter.
            `));

            throw err;
          }
          
          this.hideAllInternalErrs();
        }finally{
          this.btnRun.disabled = 0;
          this.btnRun.innerText = btnRunLabels[0];
          this.#running = 0;
        }
      });
    });
  }

  getSrcEncoding(){
    return this.#sects['Code'].encoding;
  }

  getInputAdapter(){
    return this.inputAdapterList.value || null;
  }

  getOutputAdapter(){
    return this.outputAdapterList.value || null;
  }

  hasHwProg(){
    return hasHwProg(this.info);
  }

  runHwProg(){
    this.lock(async () => {
      assert(this.hasHwProg());

      const {lang} = this;
      const hwProg = await esolangs.getHwProg(lang);
      assert(hwProg !== null);

      this.inputAdapterList.value = 'text';
      this.outputAdapterList.value = 'text';
      this.set('Code', hwProg);

      if(RUN_HW_PROG)
        O.raf(() => this.run());
    });
  }

  export(){
    const {lang, info} = this;
    const escapedLang = escape(lang);

    const code = this.get('Code');

    const getData = () => {
      const ser = new O.Serializer();

      ser.writeStr(UID);

      for(const part of VERSION.split('.'))
        ser.writeUint(part | 0);

      ser.writeDouble(O.now);
      ser.writeStr(lang);

      ser.writeStr(this.getSrcEncoding().getName());
      ser.writeStr(this.getInputAdapter() || '');
      ser.writeStr(this.getOutputAdapter() || '');

      ser.writeStr(this.get('Header'));
      ser.writeStr(code);
      ser.writeStr(this.get('Footer'));

      ser.writeStr(this.get('Input'));
      ser.writeStr(this.get('Output'));
      ser.writeStr(this.get('Debug'));

      const buf = ser.getOutput(1);
      return O.base62.encode(buf);
    };

    const {project} = O;
    const urlProjectInfo = project === 'main' ? '?' : `?project=${project}&`;
    const url = `${O.baseURL}/${urlProjectInfo}data=${getData()}`;
    const tio = 'Try it online';
    let str;

    if(WIKI_EXPORT){
      str = `[${url} ${tio}]`;
    }else{
      const tioLabel = `TIO-${(O.now).toString(16)}${O.randBuf(2).toString('hex')}`;

      str = `# ${
        O.has(info, 'details') && /^https?\:\/\/\S+$/.test(info.details) ? `[${
        escapedLang}]` : escapedLang}, ${
        this.getBytesNum()} bytes\n\n${
        O.sanl(code).map(line => {
          return `${' '.repeat(4)}${line.replace(/[\x00-\x1F]+/g, '')}`;
        }).join('\n')}\n\n[${tio}!][${tioLabel}]\n\n[${
        escapedLang}]: ${info.details}\n[${
        tioLabel}]: ${url}`;
    }

    this.expand('Export');
    this.set('Export', str);
  }

  setLang(lang){
    let found = 0;

    for(const item of O.qsa(this.langList, 'option')){
      item.selected = 0;

      if(!found && item.value === lang){
        item.selected = 1;
        found = 1;
      }
    }

    assert(found);

    this.lang = lang;
    this.info = esolangs.getInfo(lang);

    this.btnHwProg.disabled = !this.hasHwProg();
  }

  showInternalErr(sectName, msg=null){
    if(msg === null){
      msg = sectName;
      sectName = 'Debug';
    }

    this.#sects[sectName].msg = msg;
  }

  hideInternalErr(sectName='Debug'){
    this.#sects[sectName].msg = '';
  }

  hideAllInternalErrs(){
    for(const sectName of O.keys(this.#sects))
      this.hideInternalErr(sectName);
  }

  get running(){ return this.#running; }

  has(name){
    return name in this.#sects;
  }

  get(name){
    assert(this.has(name));
    return this.#sects[name].data;
  }

  set(name, data){
    assert(this.has(name));
    this.#sects[name].data = data;
  }

  clear(name){
    this.set(name, '');
  }

  expand(name){
    assert(this.has(name));
    this.#sects[name].expand();
  }

  collapse(name){
    assert(this.has(name));
    this.#sects[name].collapse();
  }

  toggle(name){
    assert(this.has(name));
    this.#sects[name].toggle();
  }

  getBytesNum(){
    return this.#sects['Code'].getBytesNum();
  }
}

class Section{
  #expanded = 0;
  #bytesNum = 0;

  constructor(elem, name, data='', editable=1, expanded=data, encoding=null){
    this.name = name;

    this.div = O.ceDiv(elem, 'section');
    this.header = O.ceDiv(this.div, 'section-header');
    this.title = O.ceDiv(this.header, 'section-title');
    this.triangle = O.ceDiv(this.title, 'section-title-triangle');
    this.titleText = O.ceDiv(this.title, 'section-title-text');
    this.triangle.innerText = '\u25B6';
    this.titleText.innerText = name;
    this.msgElem = O.ceDiv(this.div, 'section-msg');
    this.ta = O.ceTa(this.div, 'section-data');
    this.encoding = encoding;
    this.byteCounter = null;

    if(!editable)
      this.ta.readOnly = 1;

    if(encoding)
      this.byteCounter = O.ceDiv(this.header, 'byte-counter');

    this.expanded = expanded;
    this.data = data;

    this.update();
    this.aels();
  }

  aels(){
    O.ael(this.title, 'click', evt => {
      this.toggle();
    });

    O.ael(this.ta, 'input', evt => {
      this.update();
    });
  }

  update(){
    const {data} = this;

    this.ta.style.height = `${O.sanl(data).length * 19 + 8}px`;

    showByteCount: if(this.encoding){
      if(!this.encoding.checkStr(data)){
        this.byteCounter.innerText = '';
        break showByteCount;
      }

      const bytesNum = this.encoding.countBytes(data);
      this.#bytesNum = bytesNum;

      this.byteCounter.innerText = `${
        bytesNum} bytes (${
        this.encoding.getName()})`;
    }
  }

  getBytesNum(){
    return this.#bytesNum;
  }

  get msg(){
    return this.msgElem.innerText;
  }

  set msg(msg){
    this.msgElem.innerText = msg;

    if(msg) this.msgElem.classList.add('visible');
    else this.msgElem.classList.remove('visible');
  }

  get expanded(){
    return this.#expanded;
  }

  set expanded(expanded){
    expanded = expanded ? 1 : 0;
    if(this.#expanded === expanded) return;

    this.#expanded = expanded;
    this.triangle.innerText = expanded ? '\u25BC' : '\u25B6';

    if(expanded) this.div.classList.add('expanded');
    else this.div.classList.remove('expanded');
  }

  expand(){ this.expanded = 1; }
  collapse(){ this.expanded = 0; }
  toggle(){ this.expanded ^= 1; }

  get data(){ return this.ta.value; }
  set data(data){ this.ta.value = data; this.update() }
}

const escape = str => {
  return str.split('').map(c => {
    if(/[a-zA-Z0-9 ]/.test(c)) return c;
    return `&#x${O.hex(O.cc(c), 1)};`;
  }).join('');
};

const hasHwProg = info => {
  const key = 'hwProg';
  return !O.has(info, key) || info[key];
};

const handle = promise => {
  if(LOCAL) return;
  promise.catch(log);
};

main();