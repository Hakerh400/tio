'use strict';

const assert = require('assert');

class Encoding{
  static getName(){ O.virtual('getName'); }
  static checkStr(){ O.virtual('checkStr'); }
  static countBytes(){ O.virtual('countBytes'); }
}

class UTF8 extends Encoding{
  static getName(){ return 'UTF-8'; }

  static checkStr(str){
    return 1;
  }

  static countBytes(str){
    return O.Buffer.from(str).length;
  }
}

module.exports = Object.assign(Encoding, {
  [UTF8.getName()]: UTF8,
});