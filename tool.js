const fs = require('fs');
const cp = require('child_process');

/** * 对Date的扩展，将 Date 转化为指定格式的String * 月(M)、日(d)、12小时(h)、24小时(H)、分(m)、秒(s)、周(E)、季度(q)
 可以用 1-2 个占位符 * 年(y)可以用 1-4 个占位符，毫秒(S)只能用 1 个占位符(是 1-3 位的数字) * eg: * (new
 Date()).pattern("yyyy-MM-dd hh:mm:ss.S")==> 2006-07-02 08:09:04.423
 * (new Date()).pattern("yyyy-MM-dd E HH:mm:ss") ==> 2009-03-10 二 20:09:04
 * (new Date()).pattern("yyyy-MM-dd EE hh:mm:ss") ==> 2009-03-10 周二 08:09:04
 * (new Date()).pattern("yyyy-MM-dd EEE hh:mm:ss") ==> 2009-03-10 星期二 08:09:04
 * (new Date()).pattern("yyyy-M-d h:m:s.S") ==> 2006-7-2 8:9:4.18
 */
function dateFormat(dataObj, fmt) {
  const o = {
    'M+': dataObj.getMonth() + 1, //月份
    'd+': dataObj.getDate(), //日
    'h+': dataObj.getHours() % 12 == 0 ? 12 : dataObj.getHours() % 12, //小时
    'H+': dataObj.getHours(), //小时
    'm+': dataObj.getMinutes(), //分
    's+': dataObj.getSeconds(), //秒
    'q+': Math.floor((dataObj.getMonth() + 3) / 3), //季度
    S: dataObj.getMilliseconds(), //毫秒
  };
  const week = {
    0: '/u65e5',
    1: '/u4e00',
    2: '/u4e8c',
    3: '/u4e09',
    4: '/u56db',
    5: '/u4e94',
    6: '/u516d',
  };
  if (/(y+)/.test(fmt)) {
    fmt = fmt.replace(RegExp.$1, (dataObj.getFullYear() + '').substr(4 - RegExp.$1.length));
  }
  if (/(E+)/.test(fmt)) {
    fmt = fmt.replace(RegExp.$1, (RegExp.$1.length > 1 ? (RegExp.$1.length > 2 ? '/u661f/u671f' : '/u5468') : '') + week[dataObj.getDay() + '']);
  }
  for (const k in o) {
    if (new RegExp('(' + k + ')').test(fmt)) {
      fmt = fmt.replace(RegExp.$1, RegExp.$1.length == 1 ? o[k] : ('00' + o[k]).substr(('' + o[k]).length));
    }
  }
  return fmt;
}

function fsExistsSync(path) {
  try {
    fs.accessSync(path, fs.F_OK);
  } catch (e) {
    return false;
  }
  return true;
}

function evil(fn) {
  // eslint-disable-next-line no-new-func
  return new Function('return ' + fn)();
}

function parseJson(json) {
  let pureJson = json.replace(/\r\n/g, '');
  pureJson = pureJson.replace(/\n/g, '');

  try {
    return evil(`({${pureJson}})`);
  } catch (e) {
    return {};
  }
}

function parserCode(stdout) {
  const codeRegex = /code: (\d+)/;
  const messageRegex = /message: '(.*)'/;

  const result = {
    code: '',
    message: stdout
  };

  const matchCode = codeRegex.exec(stdout);

  if (matchCode && matchCode.length === 2) {
    result.code = matchCode[1];
  }

  const matchMessage = messageRegex.exec(stdout);

  if (matchMessage && matchMessage.length === 2) {
    result.message = matchMessage[1];
  }

  return result;
}

function shell(path, args, opt, verbase, resume) {
  const stdout = [];
  let stderr = [];

  const cmd = `${path} ${args.join(' ')}`;
  if (verbase || resume) {
    console.log(cmd);
  }
  let printStdoutBufferMessage = message => {
    const str = message.toString();
    stdout.push(str);

    if (verbase || resume) {
      process.stdout.write(message)
    }
  };
  let printStderrBufferMessage = message => {
    let str = message.toString();
    stderr.push(str);

    if (verbase || resume) {
      process.stdout.write(message)
    }
  };

  return new Promise((resolve, reject) => {
    const shell = cp.spawn(path, args, {});

    // 登录并且禁用续传
    if (cmd.indexOf('login') > 0 && !resume) {
      setTimeout(() => {
        process.exit(0)
      }, 3000);
    }

    shell.on('error', message => {
      console.log(message);
    });
    // cli返回的信息流是混乱的，正常输出会出现在stderr
    shell.stderr.on('data', printStderrBufferMessage);
    shell.stderr.on('error', printStderrBufferMessage);
    shell.stdout.on('data', printStdoutBufferMessage);
    shell.stdout.on('error', printStdoutBufferMessage);

    shell.on('exit', (code, signal) => {
      const result = parserCode(stdout);

      if ((code !== 0 || result.code === '10') && signal !== 'SIGTERM') {
        if (verbase) {
          console.log('Failed: code ' + code + ' signal ' + signal);
        }

        // eslint-disable-next-line prefer-promise-reject-errors
        reject({
          code: result.code || code,
          signal,
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          message: result.message,
        });
      } else {
        resolve({
          code,
          signal,
          stdout: stdout.join(''),
          stderr: stderr.join(''),
        });
      }
    });
  });
}

async function executeCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    cp.exec(command, options, (error, stdout, stderr) => {
      resolve({
        error,
        stdout,
        stderr,
      });
    });
  });
}

module.exports = {
  dateFormat: dateFormat,
  fsExistsSync: fsExistsSync,
  executeCommand: executeCommand,
  shell: shell,
  parseJson: parseJson,
};
