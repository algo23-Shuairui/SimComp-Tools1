const BaseComponent = require("../tools/baseComponent.js");
const { tools, componentList, runtimeData, indexDBData, feature_config } = require("../tools/tools.js");

// 零售显示总利润/时利润/建议定价
class retailDisplayProfit extends BaseComponent {
  constructor() {
    super();
    this.name = "零售显示总利润、时利润";
    this.describe = "在零售建筑中尝试上架零售物品的时候，会实时计算零售利润和每小时利润";
    this.enable = true;
    this.canDisable = true;
    this.tagList = ['零售', '利润'];
  }
  commonFuncList = [{
    match: () => Boolean(location.href.match(/\/b\/\d+\//)) && document.activeElement.name == "price" && document.activeElement.tagName == "INPUT",
    func: this.mainFunc
  }]
  componentData = {
    fadeTimer: undefined, // 自动消失计时器标签
    containerNode: undefined, // 显示容器元素
    lastActiveInputNode: undefined, // 最后一次激活中的input标签
    tempStepConfig: {   // 临时步长配置
      step: 0, // 临时使用步长
      minRate: 0, // 临时最小倍率
      maxRate: 0, // 临时最大倍率
    },
  }
  indexDBData = {
    minRate: 0.8, // 遍历价格初始倍率
    maxRate: 1.2, // 遍历价格最大倍率
    roughMode: false, // 粗略步长模式
  }
  cssText = [`#retail_display_div{color:var(--fontColor);padding:5px;border-radius:5px;background-color:rgba(0,0,0,0.5);position:fixed;top:50%;right:0;transform:translateX(-50%);width:220px;z-index:1032;justify-content:center;align-items:center;}#retail_display_div button{background:#1e1818;margin-top:5px;transition:ease-in-out 0.25s;}#retail_display_div button:hover{background-color:white;color:black;}#retail_display_div>div[sct-tempstep]{margin-top:10px;}#retail_display_div>div[sct-tempstep]>div>input{width:70%;background-color:rgb(0,0,0,0.8);border-radius:5px;}`];

  settingUI = () => {
    let newNode = document.createElement("div");
    let htmlText = `<div class=header>零售利润显示组件设置</div><div class=container><div><button class="btn script_opt_submit">保存更改</button></div><table><thead><tr><td>功能<td>设置<tbody><tr><td title=遍历价格的初始倍率>初始倍率<td><input class=form-control type=number value=######><tr><td title=遍历价格的最大倍率>最大倍率<td><input class=form-control type=number value=######><tr><td title='打开粗略模式之后，步长大于等于推荐定价的百分之一'>粗略模式<td><input type="checkbox" class=form-control ###### ></table></div>`;
    htmlText = htmlText.replace("######", this.indexDBData.minRate);
    htmlText = htmlText.replace("######", this.indexDBData.maxRate);
    htmlText = htmlText.replace("######", this.indexDBData.roughMode ? "checked" : "");
    newNode.id = "script_srtting_retailProfit";
    newNode.innerHTML = htmlText;
    newNode.querySelector("button.script_opt_submit").addEventListener('click', () => this.settingSubmitHandle());
    return newNode;
  }
  settingSubmitHandle() {
    let valueList = Object.values(document.querySelectorAll("div#script_srtting_retailProfit input"))
      .map(node => (node.type == "checkbox") ? node.checked : parseFloat(node.value));
    if (valueList.includes(NaN) || valueList.some(item => (typeof item != "boolean" && item <= 0))) return tools.alert("数据不正确");
    this.indexDBData.minRate = valueList[0];
    this.indexDBData.maxRate = valueList[1];
    this.indexDBData.roughMode = valueList[2];
    tools.indexDB_updateIndexDBData();
    tools.alert("已提交更改");
  }
  async mainFunc() {
    // 初始化
    let activeNode = document.activeElement;
    let activeNodeRect = activeNode.getBoundingClientRect();
    let targetNode = tools.getParentByIndex(activeNode, 5).previousElementSibling.querySelector("div > div > h3").parentElement;
    let quantity = tools.getParentByIndex(activeNode, 2).previousElementSibling.querySelector("div > p > input[name='quantity']").value;
    let price = activeNode.value;
    let baseInfo;
    try { baseInfo = this.getInfo(targetNode) } catch (error) { return }
    // 异常处理取消计算
    if (quantity == "" || quantity <= 0) return; // 零售数量小于0 不处理
    if (price == "" || price <= 0) return; // 零售单价小于0 不处理
    // 清除原有计时器
    if (this.componentData.fadeTimer) clearTimeout(this.componentData.fadeTimer);
    // 更新最近input标记
    this.componentData.lastActiveInputNode = document.activeElement;
    // 构建元素并挂载
    if (!this.componentData.containerNode) {
      let newNode = document.createElement("div");
      newNode.id = "retail_display_div";
      Object.assign(newNode.style, { display: "none" });
      this.componentData.containerNode = newNode;
      document.body.appendChild(newNode);
      // 挂载锁定时利润事件委派
      newNode.addEventListener('click', event => this.clickEventHandle(event));
    }

    // 填充内容
    let totalProfit = parseFloat((baseInfo.profit * quantity).toFixed(2));
    let hourProfit = parseFloat((totalProfit / baseInfo.duration_hour).toFixed(2));
    // 审核过滤内容
    if (isNaN(totalProfit) || isNaN(hourProfit)) return; // 数据错误
    // 挂载显示
    let htmlText = ``;
    htmlText += `<div>预估数据: </div>`
    htmlText += `<div>总利润：${totalProfit}</div>`;
    htmlText += `<div>时利润：${hourProfit}</div>`;
    htmlText += `<div style="display:flex;justify-content:space-around;;align-items:center;flex-wrap: wrap;" >`;
    htmlText += `  <button class='btn' id='script_reatil_maxHour'>最大时利</button>`;
    htmlText += `  <button class='btn' id='script_reatil_maxUnit'>最大单利</button>`
    htmlText += `  <button class='btn' id='script_reatil_targetHour'>指定时利</button>`;
    htmlText += `  <button class='btn' id='script_reatil_editStep'>临时步长</button>`;
    htmlText += `</div>`;
    htmlText += `<div sct-tempstep style='display:none;' >`;
    htmlText += `<div><span>使用步长</span> <input step=0.1  placeholder="填0取消临时步长" type=number></div><div><span>最小倍率</span> <input step=0.1  type=number></div><div><span>最大倍率</span> <input step=0.1  type=number></div>`;
    htmlText += `</div>`;
    this.componentData.containerNode.innerHTML = htmlText;
    Object.assign(this.componentData.containerNode.style, {
      display: "block",
      top: `${activeNodeRect.top + activeNodeRect.height + 50}px`,
      left: `${activeNodeRect.left + activeNodeRect.width}px`,
    })

    // 创建计时器
    this.componentData.fadeTimer = setTimeout(() => {
      Object.assign(this.componentData.containerNode.style, { display: "none" });
    }, 3000);
  }
  getInfo(node) {
    let textList = node.innerText.split("\n");
    let name = textList[0];

    // 检查 textList[3] 是否存在，并确保正则匹配结果有效
    let profit = textList[3] ? parseFloat(textList[3].replaceAll(",", "").match(/\$(-)?\d+\.\d+/)?.[0].replace("$", "")) : null;


    // 检查 textList[4] 是否存在，并确保正则匹配结果有效
    let matchList = textList[4] ? textList[4].match(/(\d+:\d+)|(\(.+\))/g) : null;
    let duration_hour = matchList ? this.getTimeFormat(matchList[0], matchList[1]) : null;

    return { name, profit, duration_hour };
  }

  getTimeFormat(targetStamp, durationTime) {
    let nowTime = new Date();
    let [targetHour, targetMinutes] = targetStamp.split(":");
    let targetTime = new Date(nowTime.getFullYear(), nowTime.getMonth(), nowTime.getDate(), targetHour, targetMinutes, nowTime.getSeconds(), nowTime.getMilliseconds());
    let timeDiff = parseFloat(((targetTime.getTime() - nowTime.getTime()) / (1000 * 60 * 60)).toFixed(3));
    let exactOffect = 0;
    // 获取分钟与秒
    exactOffect += (/(\d+)d/.test(durationTime)) ? parseInt(durationTime.match(/(\d+)d/)[1]) : 0;
    exactOffect += (/(\d+)w/.test(durationTime)) ? parseInt(durationTime.match(/(\d+)w/)[1]) * 7 : 0;
    timeDiff += (timeDiff < 0) ? ((exactOffect + 1) * 24) : exactOffect * 24;
    tools.log(`销售完成时间:${new Date(new Date().getTime() + timeDiff * 60 * 60 * 1000).toLocaleString()}`);
    return timeDiff;
  }

  getQuality(node) {
    let rootNode = tools.getParentByIndex(node, 6);
    let quality = 0;
    quality += rootNode.querySelectorAll("svg[data-icon='star'][role='img']").length;
    quality += (rootNode.querySelectorAll("svg[data-icon='star'][role='img']").length * 0.5);
    return quality;
  }

  getCost(resName, quantity) {
    // 统计未被封锁的物品,直到抵达总量符合
    let nowQuantity = 0;
    let totalCost = 0;
    let realm = runtimeData.basisCPT.realm;
    let newArray = indexDBData.basisCPT.warehouse[realm].filter(item => !item.blocked && item.kind.name == resName);
    newArray = newArray.sort((aItem, bitem) => bitem.quality - aItem.quality);
    for (let i = 0; i < newArray.length; i++) {
      let pCost = Object.values(newArray[i].cost).reduce((a, c) => a + c, 0) / newArray[i].amount;
      pCost = pCost.toFixed(2);
      let distance = quantity - nowQuantity;
      if (distance == 0) break;
      if (distance >= newArray[i].amount) {
        // 累加不满足总量
        nowQuantity += newArray[i].amount;
        totalCost += newArray[i].amount * pCost;
      } else if (distance < newArray[i].amount) {
        // 当前总量累加后超过距离
        nowQuantity += distance;
        totalCost += distance * pCost;
      }
    }
    return (totalCost / nowQuantity).toFixed(2);
  }

  // 点击事件委派
  clickEventHandle(event) {
    // 重置浮窗消失倒计时
    clearTimeout(this.componentData.fadeTimer);
    this.componentData.fadeTimer = setTimeout(() => {
      Object.assign(this.componentData.containerNode.style, { display: "none" });
    }, 5000);
    // 分发事件处理器
    if (event.target.tagName == "BUTTON" && event.target.id == "script_reatil_maxHour") return this.setMaxProfitPrice(event);
    if (event.target.tagName == "BUTTON" && event.target.id == "script_reatil_maxUnit") return this.setMaxUnitProfit(event);
    if (event.target.tagName == "BUTTON" && event.target.id == "script_reatil_targetHour") return this.lockHourProfit(event);
    if (event.target.tagName == "BUTTON" && event.target.id == "script_reatil_editStep") return this.editStep(event);
  }

  // 最大单利润
  async setMaxUnitProfit() {
    try {
      // 锁定填写框
      this.componentData.lastActiveInputNode.disabled = true;
      // 前置行为
      let { targetNode, quantity, basePrice, maxPrice, step } = this.preAction();
      // 使用临时步长信息覆写
      if (this.componentData.tempStepConfig.step != 0) {
        let avgPrice = parseFloat(tools.getParentByIndex(this.componentData.lastActiveInputNode, 5).previousElementSibling.innerText.split(/\n/).filter(text => text.match("平均价格"))[0].replace(/平均价格： \$|,/g, ""))
        step = this.componentData.tempStepConfig.step;
        basePrice = avgPrice * this.componentData.tempStepConfig.minRate;
        maxPrice = avgPrice * this.componentData.tempStepConfig.maxRate;
      }
      // 开始模拟
      let maxUnitProfit = 0.0;
      let baseInfo;
      for (let tampPrice = basePrice; tampPrice < maxPrice; tampPrice += step) {
        await tools.dely(1);
        tools.setInput(this.componentData.lastActiveInputNode, tampPrice);
        baseInfo = this.getInfo(targetNode);
        if (baseInfo.duration_hour == null) break;
        let tempUnitProfit = parseFloat(baseInfo.profit);
        if (tempUnitProfit <= maxUnitProfit) continue;
        maxUnitProfit = tempUnitProfit;
        basePrice = tampPrice;
      }
      tools.log("价格", basePrice, "单利润", maxUnitProfit);
      tools.setInput(this.componentData.lastActiveInputNode, basePrice);
    } finally {
      // 解锁填写框
      this.componentData.lastActiveInputNode.disabled = false;
    }
  }

  // 指定时利润
  async lockHourProfit(event) {
    let targetHourProfit = window.prompt("输入期望的小时收益", "0.0");
    if (isNaN(parseFloat(targetHourProfit))) return;
    try {
      // 锁定填写框
      this.componentData.lastActiveInputNode.disabled = true;
      // 前置行为
      let { targetNode, quantity, basePrice, maxPrice, step } = this.preAction();
      // 使用临时步长信息覆写
      if (this.componentData.tempStepConfig.step != 0) {
        let avgPrice = parseFloat(tools.getParentByIndex(this.componentData.lastActiveInputNode, 5).previousElementSibling.innerText.split(/\n/).filter(text => text.match("平均价格"))[0].replace(/平均价格： \$|,/g, ""))
        step = this.componentData.tempStepConfig.step;
        basePrice = avgPrice * this.componentData.tempStepConfig.minRate;
        maxPrice = avgPrice * this.componentData.tempStepConfig.maxRate;
      }
      // 开始模拟
      let maxProfit = parseFloat(targetHourProfit);
      let baseInfo;
      for (let tampPrice = basePrice; tampPrice < maxPrice; tampPrice += step) {
        await tools.dely(1);
        tools.setInput(this.componentData.lastActiveInputNode, tampPrice);
        baseInfo = this.getInfo(targetNode);
        if (baseInfo.duration_hour == null) break;
        let tempProfit = parseFloat(baseInfo.profit * quantity / baseInfo.duration_hour);
        if (tempProfit <= maxProfit) continue;
        basePrice = tampPrice;
        break;
      }
      tools.log("价格", basePrice, "时利润", maxProfit);
      tools.setInput(this.componentData.lastActiveInputNode, basePrice);
    } finally {
      // 解锁填写框
      this.componentData.lastActiveInputNode.disabled = false;
    }
  }

  // 最大时利润
  async setMaxProfitPrice(event) {
    try {
      // 锁定填写框
      this.componentData.lastActiveInputNode.disabled = true;
      // 前置行为
      let { targetNode, quantity, basePrice, maxPrice, step } = this.preAction();
      // 使用临时步长信息覆写
      if (this.componentData.tempStepConfig.step != 0) {
        let avgPrice = parseFloat(tools.getParentByIndex(this.componentData.lastActiveInputNode, 5).previousElementSibling.innerText.split(/\n/).filter(text => text.match("平均价格"))[0].replace(/平均价格： \$|,/g, ""))
        step = this.componentData.tempStepConfig.step;
        basePrice = avgPrice * this.componentData.tempStepConfig.minRate;
        maxPrice = avgPrice * this.componentData.tempStepConfig.maxRate;
      }
      // 开始模拟
      let maxProfit = -Infinity;
      let baseInfo;
      for (let tampPrice = basePrice; tampPrice < maxPrice; tampPrice += step) {
        await tools.dely(1);
        tools.setInput(this.componentData.lastActiveInputNode, tampPrice);
        baseInfo = this.getInfo(targetNode);
        if (baseInfo.duration_hour == null) break;
        let tempProfit = parseFloat(baseInfo.profit * quantity / baseInfo.duration_hour);
        if (tempProfit <= maxProfit) continue;
        maxProfit = tempProfit;
        basePrice = tampPrice;
      }
      tools.log("价格", basePrice, "时利润", maxProfit);
      tools.setInput(this.componentData.lastActiveInputNode, basePrice);
    } finally {
      // 解锁填写框
      this.componentData.lastActiveInputNode.disabled = false;
    }
  }

  // 编辑临时步长
  editStep(event) {
    const editBase = event.target.parentElement.nextElementSibling;
    const valueList = Object.values(editBase.querySelectorAll("input")).map(node => parseInt(node.value) || 0);
    // 检查是否是编辑模式
    if (event.target.innerText == "临时步长") {
      // 切换到编辑临时步长模式
      event.target.innerText = "确定设置";
      editBase.style.display = "block";
      valueList[0] = this.componentData.tempStepConfig.step;
      valueList[1] = this.componentData.tempStepConfig.minRate;
      valueList[2] = this.componentData.tempStepConfig.maxRate;
    } else {
      // 保存临时步长设置
      // 审核数据
      if (valueList[0] != 0 && (valueList[1] == 0 || valueList[2] == 0)) return tools.alert("设置了临时步长请也设置临时范围。");
      if (valueList[0] != 0 && valueList[1] >= valueList[2]) return tools.alert("起始倍率不能小于或者等于终止倍率");
      if (valueList[0] < 0) return tools.alert("数据不合法");
      // 修改样式
      event.target.innerText = "临时步长";
      editBase.style.display = "none";
      // 保存配置
      this.componentData.tempStepConfig.step = valueList[0];
      this.componentData.tempStepConfig.minRate = valueList[1];
      this.componentData.tempStepConfig.maxRate = valueList[2];
    }
  }

  // 步进模拟前置行为
  preAction() {
    // 获取平均价格
    tools.setInput(this.componentData.lastActiveInputNode, 0);
    let avgPrice = parseFloat(tools.getParentByIndex(this.componentData.lastActiveInputNode, 5).previousElementSibling.innerText.split(/\n/).filter(text => text.match("平均价格"))[0].replace(/平均价格： \$|,/g, ""))
    // 获取数据
    let targetNode = tools.getParentByIndex(this.componentData.lastActiveInputNode, 5).previousElementSibling.querySelector("div > div > h3").parentElement;
    let quantity = tools.getParentByIndex(this.componentData.lastActiveInputNode, 2).previousElementSibling.querySelector("div > p > input[name='quantity']").value;
    let basePrice = parseFloat(avgPrice) * this.indexDBData.minRate;
    let maxPrice = parseFloat(avgPrice) * this.indexDBData.maxRate;
    let step = this.getStep(basePrice);
    return { targetNode, quantity, basePrice, maxPrice, step };
  }

  // 获取步长
  getStep(basePrice) {
    let baseStep = 0;
    let percentStep = basePrice * 0.01;

    if (basePrice <= 8) {
      baseStep = 0.01
    } else if (basePrice <= 100) {
      baseStep = 0.1
    } else if (basePrice <= 500) {
      baseStep = 0.2
    } else if (basePrice <= 2000) {
      baseStep = 0.5
    } else {
      baseStep = 1;
    }

    if (this.indexDBData.roughMode) {
      return (percentStep >= baseStep) ? percentStep : baseStep;
    } else {
      return baseStep;
    }
  }
}
new retailDisplayProfit();