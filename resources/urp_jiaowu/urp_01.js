// 通用 URP 教务拾光课程表适配脚本

/**
 * 解析位图格式的周次 (011100...)
 */
function parseWeekString(weekStr) {
    let weeks = [];
    if (!weekStr) return weeks;
    for (let i = 0; i < weekStr.length; i++) {
        if (weekStr[i] === '1') weeks.push(i + 1);
    }
    return weeks;
}

/**
 * 格式化时间 (0800 -> 08:00)
 */
function formatTime(timeStr) {
    if (timeStr && timeStr.length === 4) {
        return timeStr.substring(0, 2) + ":" + timeStr.substring(2);
    }
    return timeStr;
}

/**
 * 动态获取 API 路径
 */
function getApiUrl() {
    const baseUrl = window.location.origin;
    return `${baseUrl}/student/courseSelect/thisSemesterCurriculum/ajaxStudentSchedule/callback`;
}

async function promptUserToStart() {
    return await window.AndroidBridgePromise.showAlert(
        "教务系统课表导入",
        "请确保您已进入教务系统课表查询页面后再开始导入",
        "好的，开始导入"
    );
}

/**
 * 网络请求和数据解析
 */
async function fetchAndParseJwData() {
    try {
        const apiUrl = getApiUrl();
        console.log("正在通过动态地址获取教务数据:", apiUrl);

        AndroidBridge.showToast("正在获取教务数据...");
        
        const response = await fetch(apiUrl, {
            "headers": { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
            "method": "POST",
            "credentials": "include"
        });

        const data = await response.json();
        
        if (!data) throw new Error("服务器未返回任何数据");
        
        // 严格遵循 dateList 结构解析
        if (!data.dateList || !Array.isArray(data.dateList)) {
            console.error("教务返回数据异常:", data);
            throw new Error("未能获取到课程列表，请确认是否已登录或页面正确");
        }

        // 解析时间段 (jcsjbs)
        const timeSlots = (data.jcsjbs || []).map(item => ({
            number: parseInt(item.jc),
            startTime: formatTime(item.kssj),
            endTime: formatTime(item.jssj)
        }));

        // 解析课程
        let courses = [];
        data.dateList.forEach(plan => {
            if (plan && plan.selectCourseList && Array.isArray(plan.selectCourseList)) {
                plan.selectCourseList.forEach(c => {
                    const teacher = (c.attendClassTeacher || "").replace(/\* /g, "").trim();
                    if (c.timeAndPlaceList && Array.isArray(c.timeAndPlaceList)) {
                        c.timeAndPlaceList.forEach(tp => {
                            courses.push({
                                name: c.courseName,
                                teacher: teacher,
                                position: (tp.teachingBuildingName || "") + (tp.classroomName || ""),
                                day: parseInt(tp.classDay),
                                startSection: parseInt(tp.classSessions),
                                endSection: parseInt(tp.classSessions) + parseInt(tp.continuingSession) - 1,
                                weeks: parseWeekString(tp.classWeek)
                            });
                        });
                    }
                });
            }
        });

        if (courses.length === 0) {
            throw new Error("该学期暂无排课数据");
        }

        return { courses, timeSlots };
    } catch (e) {
        console.error("解析失败详情:", e);
        AndroidBridge.showToast("同步失败: " + e.message);
        return null;
    }
}

/**
 * 保存数据到应用
 */
async function saveToApp(result) {
    const courseSuccess = await window.AndroidBridgePromise.saveImportedCourses(JSON.stringify(result.courses));
    if (!courseSuccess) return false;

    if (result.timeSlots && result.timeSlots.length > 0) {
        await window.AndroidBridgePromise.savePresetTimeSlots(JSON.stringify(result.timeSlots));
    }
    
    await window.AndroidBridgePromise.saveCourseConfig(JSON.stringify({
        semesterTotalWeeks: 20 
    }));
    
    return true;
}

/**
 * 流程控制
 */
async function runImportFlow() {
    const alertResult = await promptUserToStart();
    if (!alertResult) return;

    const result = await fetchAndParseJwData();
    if (!result || result.courses.length === 0) return;

    if (await saveToApp(result)) {
        AndroidBridge.showToast(`成功导入 ${result.courses.length} 个课程时段`);
        AndroidBridge.notifyTaskCompletion(); 
    }
}

// 启动
runImportFlow(); 