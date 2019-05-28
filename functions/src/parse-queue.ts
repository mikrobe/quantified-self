'use strict';

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as requestPromise from "request-promise-native";
import {EventImporterFIT} from "quantified-self-lib/lib/events/adapters/importers/fit/importer.fit";
import {EventInterface} from "quantified-self-lib/lib/events/event.interface";
import * as Pako from "pako";
import {generateIDFromParts} from "./utils";
import {MetaData} from "quantified-self-lib/lib/meta-data/meta-data";
import {ServiceNames} from "quantified-self-lib/lib/meta-data/meta-data.interface";
import {refreshTokenIfNeeded} from "./service-tokens";
import {ServiceTokenInterface} from "quantified-self-lib/lib/service-tokens/service-token.interface";


export const parseQueue = functions.region('europe-west2').runWith({timeoutSeconds: 240}).pubsub.schedule('every 5 minutes').onRun(async (context) => {

  // @todo add queue item sort date for creation
  // Suunto app refresh tokens should be refreshed every 180days we target at 15 days before 165 days
  const querySnapshot = await admin.firestore().collection('suuntoAppWorkoutQueue').where('processed', '==', false).where("retryCount", "<=", 10).limit(100).get(); // Max 10 retries
  console.log(`Found ${querySnapshot.size} queue items to process`);
  let count = 0;
  for (const queueItem of querySnapshot.docs){
    try {
      await processQueueItem(queueItem);
      count++;
    }catch (e) {
      console.error(`Error parsing queue item #${count} of ${querySnapshot.size} and id ${queueItem.id}`)
    }
  }
  console.log(`Parsed ${count} queue items out of ${querySnapshot.size}`);
});

export async function processQueueItem(queueItem: any) {

  console.log(`Processing queue item ${queueItem.id} and username ${queueItem.data().userName} at retry count ${queueItem.data().retryCount}`);
  // queueItem.data() is never undefined for query queueItem snapshots
  const tokenQuerySnapshots = await admin.firestore().collectionGroup('tokens').where("userName", "==", queueItem.data()['userName']).get();

  // If there is no token for the user skip @todo or retry in case the user reconnects?
  if (!tokenQuerySnapshots.size) {
    console.error(`No token found for queue item ${queueItem.id} and username ${queueItem.data().userName} increasing count just in case`);
    return  increaseRetryCountForQueueItem(queueItem, new Error(`No tokens found`));
  }

  let processedCount = 0;
  for (const tokenQueryDocumentSnapshot of tokenQuerySnapshots.docs) {
    const data = <ServiceTokenInterface>tokenQueryDocumentSnapshot.data();
    const parent1 = tokenQueryDocumentSnapshot.ref.parent;
    if (!parent1) {
      throw new Error(`No parent found for ${tokenQueryDocumentSnapshot.id}`);
    }
    const parentID = parent1.parent!.id;
    // Check the token if needed
    await refreshTokenIfNeeded(tokenQueryDocumentSnapshot, false);
    let result;
    try {
      result = await requestPromise.get({
        headers: {
          'Authorization': data.accessToken,
          'Ocp-Apim-Subscription-Key': functions.config().suuntoapp.subscription_key,
        },
        encoding: null,
        url: `https://cloudapi.suunto.com/v2/workout/exportFit/${queueItem.data()['workoutID']}`,
      });
      console.log(`Downloaded FIT file for ${queueItem.id} and token user ${data.userName}`)
    } catch (e) {
      console.error(e);
      console.error(`Could not get workout for ${queueItem.id} and token user ${data.userName}. Trying to refresh token and update retry count from ${queueItem.data().retryCount} to ${queueItem.data().retryCount + 1}`);
      return  increaseRetryCountForQueueItem(queueItem, e);
    }

    try {
      const event = await EventImporterFIT.getFromArrayBuffer(result);
      console.log(`Created Event from FIT file of ${queueItem.id} and token user ${data.userName}`);
      // Id for the event should be serviceName + workoutID
      event.setID(generateIDFromParts(['suuntoApp', queueItem.data()['workoutID']]));
      event.metaData = new MetaData(ServiceNames.SuuntoApp, queueItem.data()['workoutID'], queueItem.data()['userName'], new Date());
      await setEvent(parentID, event);
      console.log(`Created Event ${event.getID()} for ${queueItem.id} and token user ${data.userName}`);
      processedCount++;
      console.log(`Parsed ${processedCount}/${tokenQuerySnapshots.size} for ${queueItem.id}`);
      // await queueItem.ref.delete();
    } catch (e) {
      // @todo should delete event  or separate catch
      console.error(e);
      console.error(`Could not save event for ${queueItem.id} trying to update retry count from ${queueItem.data().retryCount} and token user ${data.userName} to ${queueItem.data().retryCount + 1}`);
      return  increaseRetryCountForQueueItem(queueItem, e);
    }
  }

  // If not all tokens are processed log it and increase the retry count
  if (processedCount !== tokenQuerySnapshots.size) {
    console.error(`Could not process all tokens for ${queueItem.id} will try again later`);
    return  increaseRetryCountForQueueItem(queueItem, new Error('Not all tokens could be processed'));
  }

  // For each ended so we can set it to processed
  return updateToProcessed(queueItem);

}

async function increaseRetryCountForQueueItem(queueItem: any, error: Error) {
  const errors = queueItem.data().errors || [];
  errors.push({
    error: JSON.stringify(error),
    retryCount: queueItem.data().retryCount,
    date: (new Date()).toJSON(),
  });
  try {
    await queueItem.ref.update({
      retryCount: queueItem.data().retryCount + 1,
      errors: errors,
    });
    console.error(`Updated retry count for ${queueItem.id} to ${queueItem.data().retryCount + 1}`);
  } catch (e) {
    console.error(e);
    console.error(`Could not update retry count on ${queueItem.id}`)
  }
}

async function updateToProcessed(queueItem: any) {
  try {
    await queueItem.ref.update({
      'processed': true,
      'processedAt': new Date(),
    });
    console.log(`Updated to processed  ${queueItem.id}`);
  } catch (e) {
    console.error(e);
    console.error(`Could not update processed state for ${queueItem.id}`)
  }
}

// @todo fix the ids
async function setEvent(userID: string, event: EventInterface) {
  const writePromises: Promise<any>[] = [];
  event.getActivities()
    .forEach((activity, index) => {
      activity.setID(generateIDFromParts([<string>event.getID(), index.toString()]));
      writePromises.push(
        admin.firestore().collection('users')
          .doc(userID)
          .collection('events')
          .doc(<string>event.getID())
          .collection('activities')
          .doc(<string>activity.getID())
          .set(activity.toJSON()));

      activity.getAllStreams().forEach((stream) => {
        // console.log(`Stream ${stream.type} has size of GZIP ${getSize(Buffer.from((Pako.gzip(JSON.stringify(stream.data), {to: 'string'})), 'binary'))}`);
        writePromises.push(
          admin.firestore()
            .collection('users')
            .doc(userID)
            .collection('events')
            .doc(<string>event.getID())
            .collection('activities')
            .doc(<string>activity.getID())
            .collection('streams')
            .doc(stream.type)
            .set({
              type: stream.type,
              data: Buffer.from((Pako.gzip(JSON.stringify(stream.data), {to: 'string'})), 'binary'),
            }))
      });
    });
  try {
    await Promise.all(writePromises);
    return admin.firestore().collection('users').doc(userID).collection('events').doc(<string>event.getID()).set(event.toJSON());
  } catch (e) {
    console.error(e);
    debugger;
    return
    // Try to delete the parent entity and all subdata
    // await this.deleteAllEventData(user, event.getID());
  }
}
