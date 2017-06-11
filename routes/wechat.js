var express = require('express');
var router = express.Router();
var errors = require('web-errors').errors;
var fs = require("fs");
var nodeWeixinOauth = require('node-weixin-oauth');
var nodeWeixinAuth = require('node-weixin-auth');
var nodeWeixinConfig = require("node-weixin-config");
var nodeWeixinSettings = require('node-weixin-settings');
var session = require('express-session');

var nwcApp = {
    settingsCachePath: '/tmp',
    settingsCachePrefix: 'nws_',
    jsSDKDomain: 'qrp.wislay.com',
    id: 'wx7c2ce4da12b3e8c8',
    secret: '86e99432434c0053bafe7d3cf961cb3e',
    token: 'b2d5c253cf484d2fc448fc4637845540'
};

// 调整TIME_GAP来避免重复请求
// 默认是500秒，基本上不会出现失效的情况
nodeWeixinAuth.TIME_GAP = 3600 * 1000;

var refreshWechatAccessTokenIfExpired = function () {
    // TODO 确定服务器AccessToken更新逻辑
    console.log("refreshWechatAccessTokenIfExpired");
    /*
    nodeWeixinAuth.determine(nodeWeixinSettings, nwcApp, function () {
        //这里添加发送请求的代码
    });
    */
};

var sessionStart = function (req, res) {
    req.session.reload(function (err) {
        // will have a new session here
        if (err) {
            req.session.regenerate(function (err) {
                if (err) {
                    console.log("Failed to regenerate session " + err);
                }
            });
        }
    });
};

var getSettingCacheFilename = function (id, key) {
    return nwcApp.settingsCachePath + '/' +
        nwcApp.settingsCachePrefix + id + '_' + key;
};

var showTargetPage = function (req, res) {
    nodeWeixinOauth.profile(req.session.openid, req.session.access_token, function (error, data) {
        res.send(data);
    });
};

nodeWeixinSettings.registerGet(function (id, key, cb) {
    var fn = getSettingCacheFilename(id, key);
    console.log("read config from " + fn);

    fs.readFile(fn, function (err, data) {
        if (err) {
            console.log(err);
            cb('');
            return;
        }

        console.log(data);

        var dataJSON = JSON.parse(data);

        if (typeof dataJSON !== typeof {}) {
            console.log('Faied to parse JSON data');
            cb({});
            return;
        }

        cb(dataJSON);
    })
});

nodeWeixinSettings.registerSet(function (id, key, value, cb) {
    var fn = getSettingCacheFilename(id, key);
    if (typeof value === typeof {}) {
        value = JSON.stringify(value);
    }

    console.log('Try write ' + fn + ' data ' + value);

    fs.writeFile(fn, value, function (err) {
        if (err) {
            cb(err);
        }
        console.log('Write ' + fn + ' data ' + value);
    })
});

nodeWeixinConfig.app.init(nwcApp);

// //手动得到accessToken
/*
nodeWeixinAuth.tokenize(nodeWeixinSettings, nwcApp, function (error, json) {
    //var accessToken = json.access_token;
});
*/


/* GET home page. */
router.get('/', function (req, res, next) {
    refreshWechatAccessTokenIfExpired();

    var data = nodeWeixinAuth.extract(req.query);
    nodeWeixinAuth.ack(nwcApp.token, data, function (error, data) {
        if (!error) {
            res.send(data);
            return;
        }
        switch (error) {
            case 1:
                res.send(errors.INPUT_INVALID);
                break;
            case 2:
                res.send(errors.SIGNATURE_NOT_MATCH);
                break;
            default:
                res.send(errors.UNKNOWN_ERROR);
                break;
        }
    });
});


router.get('/qr1', function (req, res, next) {
    refreshWechatAccessTokenIfExpired();

    sessionStart(req, res);
    console.log("=========== qr1 ===========");
    console.log(req.headers.cookie);
    console.log(req.session);
    console.log(nodeWeixinOauth.session);

    var now = new Date().getTime();
    var targetUrl = 'http://' + nwcApp.jsSDKDomain + '/wechat/qr3';

    if (req.session.access_token && req.session.expires_at && req.session.openid && now - req.session.expires_at < 0) {
        console.log("GOTO TARGET");
        res.redirect(targetUrl);
        return;
    }

    // userInfo: 0 表示最少的基本信息， 1表示获取更多用户信息
    var url = nodeWeixinOauth.createURL(nwcApp.id, 'http://' + nwcApp.jsSDKDomain + '/wechat/qr2', 0, 1);
    res.redirect(url);
});

router.get('/qr2', function (req, res, next) {
    refreshWechatAccessTokenIfExpired();

    sessionStart(req, res);
    console.log("=========== qr2 ===========");
    console.log(req.headers.cookie);

    var code = req.param('code');

    if (!code) {
        res.send("Ah?");
    }

    nodeWeixinOauth.success(nwcApp, req.param('code'), function (error, body) {
        if (!error) {
            console.log(req.session);
            //console.log(nodeWeixinAuth);
            console.log("success cb");
            console.log(body);
            console.log(nodeWeixinOauth.session);
            req.session.access_token = body.access_token;
            req.session.openid = body.openid;
            var now = new Date().getTime();
            req.session.expires_at = body.expires_in * 1000 + now;
            console.log("req.session");
            console.log(req.session);
            showTargetPage(req, res);
        }
    });


});

router.get('/qr3', function (req, res, next) {
    refreshWechatAccessTokenIfExpired();

    sessionStart(req, res);
    console.log("=========== qr3 ===========");
    console.log(req.headers.cookie);
    console.log(req.session);

    var oauthUrl = 'http://' + nwcApp.jsSDKDomain + '/wechat/qr1';

    if (!req.session.access_token || !req.session.expires_at || !req.session.openid) {
        res.redirect(oauthUrl);
        return;
    }

    var now = new Date().getTime();

    if (now - req.session.expires_at > 0) {
        res.redirect(oauthUrl);
        return;
    }

    showTargetPage(req, res);
});

module.exports = router;
