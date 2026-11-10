import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNextDepartures, getBucharestTime, haversineDistanceMeters, normalizeText } from '../utils.js';
test('normalizeText: correctly strips Romanian diacritics and converts to lowercase', () => {
    assert.equal(normalizeText('Piața Romană'), 'piata romana');
    assert.equal(normalizeText('Șoseaua Ștefan cel Mare'), 'soseaua stefan cel mare');
    assert.equal(normalizeText('GARA DE NORD'), 'gara de nord');
    assert.equal(normalizeText('Țepeș Vodă'), 'tepes voda');
    assert.equal(normalizeText('  Întors / Tur  '), 'intors / tur');
});
test('haversineDistanceMeters: computes accurate geographical distance', () => {
    // Distance between Piața Romană (44.4447, 26.0975) and Piața Victoriei (44.4530, 26.0847) is ~1.3km
    const dist = haversineDistanceMeters(44.4447, 26.0975, 44.4530, 26.0847);
    assert.ok(dist > 1100 && dist < 1600, `Expected ~1300m, got ${dist}m`);
    // Same coordinates should be 0 meters
    assert.equal(haversineDistanceMeters(44.4, 26.0, 44.4, 26.0), 0);
});
test('getBucharestTime: returns valid hour, minute, and timezone info', () => {
    const timeInfo = getBucharestTime();
    assert.ok(timeInfo.hour >= 0 && timeInfo.hour <= 23, 'Hour should be 0-23');
    assert.ok(timeInfo.minute >= 0 && timeInfo.minute <= 59, 'Minute should be 0-59');
    assert.equal(typeof timeInfo.isWeekend, 'boolean');
    assert.match(timeInfo.timeString, /^\d{2}:\d{2}$/);
});
test('calculateNextDepartures: resolves weekday vs weekend and computes upcoming departures', () => {
    const scheduleWd = '05:00,06:00,07:30,08:00,12:00,14:30,17:00,20:00,23:00';
    const scheduleWe = '06:00,08:00,10:00,12:00,16:00,20:00';
    // Test at 07:15 on a weekday
    const weekdayRes = calculateNextDepartures(scheduleWd, scheduleWe, {
        customHour: 7,
        customMinute: 15,
        customIsWeekend: false,
        limit: 3
    });
    assert.equal(weekdayRes.dayType, 'weekday');
    assert.equal(weekdayRes.estimates.length, 3);
    assert.equal(weekdayRes.estimates[0].time, '07:30');
    assert.equal(weekdayRes.estimates[0].minutesUntil, 15);
    assert.equal(weekdayRes.estimates[0].display, 'în 15 min (la 07:30)');
    assert.equal(weekdayRes.estimates[1].time, '08:00');
    assert.equal(weekdayRes.estimates[1].minutesUntil, 45);
    // Test immediate departure (minutesUntil === 0)
    const immediateRes = calculateNextDepartures(scheduleWd, scheduleWe, {
        customHour: 8,
        customMinute: 0,
        customIsWeekend: false,
        limit: 1
    });
    assert.equal(immediateRes.estimates[0].display, 'Pleacă acum');
    // Test at 09:30 on weekend
    const weekendRes = calculateNextDepartures(scheduleWd, scheduleWe, {
        customHour: 9,
        customMinute: 30,
        customIsWeekend: true,
        limit: 2
    });
    assert.equal(weekendRes.dayType, 'weekend');
    assert.equal(weekendRes.estimates[0].time, '10:00');
    assert.equal(weekendRes.estimates[0].minutesUntil, 30);
});
//# sourceMappingURL=utils.test.js.map