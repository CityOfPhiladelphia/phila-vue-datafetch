class BaseClient {
  constructor(opts) {
    this.config = opts.config;
    this.store = opts.store;
    this.dataManager = opts.dataManager;
  }

  evaluateParams(feature, dataSource) {
    // console.log('base-client evaluateParams is running, feature:', feature, 'dataSource:', dataSource);
    const params = {};
    if (!dataSource.options.params) {
      return params;
    }
    const paramEntries = Object.entries(dataSource.options.params);
    const state = this.store.state;

    for (let [ key, valOrGetter ] of paramEntries) {
      let val;

      if (typeof valOrGetter === 'function') {
        // console.log('valOrGetter is a function:', valOrGetter);
        val = valOrGetter(feature, state);
      } else {
        val = valOrGetter;
      }

      params[key] = val;
    }

    return params;
  }

  assignFeatureIds(features, dataSourceKey, topicId) {
    const featuresWithIds = [];

    // REVIEW this was not working with Array.map for some reason
    // it was returning an object when fetchJson was used
    // that is now converted to an array in fetchJson
    for (let i = 0; i < features.length; i++) {
      const suffix = (topicId ? topicId + '-' : '') + i;
      const id = `feat-${dataSourceKey}-${suffix}`;
      const feature = features[i];
      // console.log(dataSourceKey, feature);
      try {
        feature._featureId = id;
      } catch (e) {
        console.warn(e);
      }
      featuresWithIds.push(feature);
    }

    // console.log(dataSourceKey, features, featuresWithIds);
    return featuresWithIds;
  }

  didFetch(key, status, data, targetId) {
    // console.log('DID FETCH DATA:', key, targetId || '', data);

    const dataOrNull = status === 'error' ? null : data;
    let stateData = dataOrNull;

    // if this is an array, assign feature ids
    if (Array.isArray(stateData)) {
      stateData = this.assignFeatureIds(stateData, key, targetId);
    }

    // does this data source have targets?
    // const targets = this.config.dataSources[key].targets;

    // put data in state
    const setSourceDataOpts = {
      key,
      data: stateData,
    };
    const setSourceStatusOpts = {
      key,
      status,
    };
    if (targetId) {
      setSourceDataOpts.targetId = targetId;
      setSourceStatusOpts.targetId = targetId;
    }

    // commit
    this.store.commit('setSourceData', setSourceDataOpts);
    this.store.commit('setSourceStatus', setSourceStatusOpts);

    // try fetching more data
    // console.log('base-client js is calling fetchData()');
    this.fetchData();
  }

  evaluateDataForUnits(data) {
    // console.log('base-client evaluateDataForUnits data:', data);

    var units = [], filteredData, dataList = [];
    let groupedData = _.groupBy(data.rows, a => a.pwd_parcel_id);

    for (let item in groupedData){
      groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) : dataList.push(groupedData[item][0]);
    }

    let bldgRecord = JSON.parse(JSON.stringify(data.rows[0]));

    if(units.length > 0) {
      units = _.groupBy(units, a => a.pwd_parcel_id);
      data.rows = data.rows.filter(a => !Object.keys(units).includes(a.pwd_parcel_id));
    }

    // console.log("Units List: ", units, "Data: ", data )
    this.store.commit('setUnits', units);

    for (let unit in units) {
      // console.log("Unit: ", units[unit])
      for (let i in bldgRecord) {
        bldgRecord[i] = "";
      }
      let bldgRecordPush = JSON.parse(JSON.stringify(bldgRecord));
      bldgRecordPush.owner_1 = "Condominium (" + units[unit].length + " Units)";
      bldgRecordPush.owner_2 = null;
      bldgRecordPush.location = units[unit][0].location;
      bldgRecordPush.condo = true;
      bldgRecordPush.pwd_parcel_id = units[unit][0].pwd_parcel_id;
      data.rows.push(bldgRecordPush);
    }
    return data;
  }
}

export default BaseClient;
